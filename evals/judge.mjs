#!/usr/bin/env node
// LLM judge: for every read-only answer, which mustHave facts are present
//   (a) in the full answer, and (b) in the first 12 lines only (the skim proxy).
// Judge model: sonnet, blind to the arm. Run PASSES independent passes, take the majority.
//   node evals/judge.mjs [--date 2026-10-20] [--passes 3] [--concurrency 4]
// Output: evals/results/<date>/judged.json
// Note: the `full` / `first12` arrays in it are majority votes (ties = false). report.mjs does not use them;
// it scores each fact as the share of passes in `rawPasses` that found it.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstRows } from './rows.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const DATE = opt('date', '2026-10-20');
const PASSES = Number(opt('passes', 3));
const CONCURRENCY = Number(opt('concurrency', 4));
const BUDGET = Number(opt('budget', 3));
const EFFORT = opt('effort', 'medium');
// --window-rows N: add one more mode, "the first N rendered terminal rows" (100 columns), to an existing judged.json.
const WINDOW = opt('window-rows', '') ? Number(opt('window-rows', '')) : 0;
// One shared cwd, so every call has the same system prompt and the prompt cache can hit.
const JUDGE_CWD = mkdtempSync(join(tmpdir(), 'skim-judge-'));
const OUT = join(here, 'results', DATE);
const FIRST_N = 12;
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')).read;
const arms = ['default', 'concise', 'skim'].filter((a) => existsSync(join(OUT, 'raw', a)));

const SYSTEM = 'You are a strict, literal fact checker. You never use outside knowledge to fill in what a text does not say. You reply with the requested JSON only.';

function prompt({ question, facts, text, excerpt }) {
  const list = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  return `A developer asked a coding assistant this question about a small codebase:

QUESTION: ${question}

Below is ${excerpt ? `ONLY ${typeof excerpt === 'string' ? excerpt : `THE FIRST ${FIRST_N} LINES`} of` : ''} the assistant's answer. Judge ${excerpt ? 'only what appears in this excerpt; the rest of the answer is not available to you' : 'the whole text'}.

<answer>
${text}
</answer>

FACTS (ground truth):
${list}

For each fact, decide whether the answer ${excerpt ? 'excerpt ' : ''}states it. Rules:
- A fact is present if the text says it explicitly, or says something that means the same thing. Different wording, a table cell, a diagram or a code comment all count.
- A vague hint, a mention of only part of the fact, or a fact that the reader would have to work out for themselves does NOT count. If a fact has several parts (for example a number and a file), all parts must be there.
- Extra detail beyond the fact is fine. A claim that contradicts the fact does not count as present.
${excerpt ? '' : `
Also decide "first_line_answers": does the FIRST non-empty line of the answer, read on its own, already give the direct answer, verdict or outcome to the question? It is false if the first line is a preamble, a restatement of the question, a statement of what the answer will cover, or only a heading.
`}
Reply with JSON only, no other text: {"facts":[true or false for each fact in order]${excerpt ? '' : ',"first_line_answers":true or false'}}`;
}

function runJudge(p) {
  const schema = JSON.stringify({
    type: 'object',
    properties: { facts: { type: 'array', items: { type: 'boolean' } }, first_line_answers: { type: 'boolean' } },
    required: ['facts'],
  });
  return new Promise((resolve) => {
    const cwd = JUDGE_CWD;
    const argv = ['-p', p, '--model', 'sonnet', '--effort', EFFORT, '--output-format', 'json', '--no-session-persistence', '--tools', '',
      '--system-prompt', SYSTEM, '--disable-slash-commands', '--strict-mcp-config',
      '--settings', JSON.stringify({ disableAllHooks: true }), '--json-schema', schema];
    const child = spawn('claude', argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        let v = j.structured_output;
        if (!v) { const m = String(j.result).match(/\{[\s\S]*\}/); v = JSON.parse(m[0]); }
        resolve({ value: v, cost: j.total_cost_usd ?? 0 });
      } catch { resolve({ value: null, cost: 0, raw: out.slice(0, 500) }); }
    });
  });
}

const tasks = [];
for (const c of cases) for (const arm of arms) {
  const file = join(OUT, 'answers', arm, `${c.id}.md`);
  if (!existsSync(file)) continue;
  const answer = readFileSync(file, 'utf8').replace(/\n$/, '');
  const first = answer.split('\n').slice(0, FIRST_N).join('\n');
  for (let pass = 0; pass < PASSES; pass++) {
    if (WINDOW) {
      tasks.push({ arm, id: c.id, pass, mode: `rows${WINDOW}`, p: prompt({ question: c.prompt, facts: c.mustHave, text: firstRows(answer, WINDOW), excerpt: `THE FIRST ${WINDOW} ROWS (as shown in a 100-column terminal)` }) });
      continue;
    }
    tasks.push({ arm, id: c.id, pass, mode: 'full', p: prompt({ question: c.prompt, facts: c.mustHave, text: answer }) });
    tasks.push({ arm, id: c.id, pass, mode: 'first12', p: prompt({ question: c.prompt, facts: c.mustHave, text: first, excerpt: true }) });
  }
}
tasks.sort((x, y) => x.pass - y.pass); // finish whole passes first, so a budget stop leaves complete passes
console.log(`judge calls: ${tasks.length}, budget $${BUDGET}`);
let cost = 0, done = 0, failed = 0;
const results = [];
async function worker() {
  while (tasks.length) {
    if (cost >= BUDGET) return;
    const t = tasks.shift();
    let r = await runJudge(t.p);
    if (!r.value || !Array.isArray(r.value.facts)) r = await runJudge(t.p); // one retry
    cost += r.cost;
    if (!r.value) failed++;
    results.push({ arm: t.arm, id: t.id, pass: t.pass, mode: t.mode, value: r.value });
    if (++done % 10 === 0) console.log(`${done} done, $${cost.toFixed(2)}, failed ${failed}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (WINDOW) {
  const file = join(OUT, 'judged.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of results) doc.judged[`${r.arm}/${r.id}`].rawPasses.push({ pass: r.pass, mode: r.mode, value: r.value });
  doc.extraJudgeCost = (doc.extraJudgeCost ?? 0) + cost;
  doc.extraModes = [...new Set([...(doc.extraModes ?? []), `rows${WINDOW}`])];
  writeFileSync(file, JSON.stringify(doc, null, 2));
  rmSync(JUDGE_CWD, { recursive: true, force: true });
  console.log(`added rows${WINDOW}. cost $${cost.toFixed(2)}, failed ${failed}`);
  process.exit(0);
}

// Majority vote across passes.
const judged = {};
for (const c of cases) for (const arm of arms) {
  const rs = (mode) => results.filter((r) => r.arm === arm && r.id === c.id && r.mode === mode && r.value && r.value.facts.length === c.mustHave.length);
  const maj = (list) => list.length ? list.filter(Boolean).length * 2 > list.length : null;
  const per = (mode) => c.mustHave.map((_, i) => maj(rs(mode).map((r) => r.value.facts[i])));
  const agree = (mode) => {
    const r = rs(mode); if (r.length < 2) return null;
    return c.mustHave.map((_, i) => new Set(r.map((x) => x.value.facts[i])).size === 1).filter(Boolean).length / c.mustHave.length;
  };
  judged[`${arm}/${c.id}`] = {
    full: per('full'), first12: per('first12'),
    firstLineAnswers: maj(rs('full').map((r) => r.value.first_line_answers)),
    passesUsed: { full: rs('full').length, first12: rs('first12').length },
    agreement: { full: agree('full'), first12: agree('first12') },
    rawPasses: results.filter((r) => r.arm === arm && r.id === c.id).map(({ pass, mode, value }) => ({ pass, mode, value })),
  };
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'judged.json'), JSON.stringify({ judgeModel: 'sonnet', passes: PASSES, firstN: FIRST_N, cost, failed, judged }, null, 2));
rmSync(JUDGE_CWD, { recursive: true, force: true });
console.log(`done. judge cost $${cost.toFixed(2)}, failed calls ${failed}`);

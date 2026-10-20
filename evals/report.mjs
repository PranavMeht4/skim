#!/usr/bin/env node
// Builds results/<date>/summary.json and REPORT.md from raw runs + judged.json.
// Hand-written observations live in results/<date>/notes.md and are pasted in verbatim.
//   node evals/report.mjs [--date 2026-10-20]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../scripts/analyze.mjs';
import { renderedRows, COLS } from './rows.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DATE = args.includes('--date') ? args[args.indexOf('--date') + 1] : '2026-10-20';
const OUT = join(here, 'results', DATE);
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const judgedFile = JSON.parse(readFileSync(join(OUT, 'judged.json'), 'utf8'));
const J = judgedFile.judged;
const ARMS = ['default', 'concise', 'skim'].filter((a) => existsSync(join(OUT, 'raw', a)));

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);
const load = (arm, id) => { const f = join(OUT, 'raw', arm, `${id}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

const cells = []; // read-only cells
for (const c of cases.read) for (const arm of ARMS) {
  const raw = load(arm, c.id);
  if (!raw) continue;
  const text = raw.result ?? '';
  const a = analyze(text);
  const j = J[`${arm}/${c.id}`] ?? {};
  // Fact score = share of judge passes that said "present" (so a 2-1 split counts 0.67 of a fact).
  const passes = (mode) => (j.rawPasses ?? []).filter((r) => r.mode === mode && r.value && Array.isArray(r.value.facts) && r.value.facts.length === c.mustHave.length);
  const score = (mode) => { const ps = passes(mode); return ps.length ? c.mustHave.map((_, i) => ps.filter((p) => p.value.facts[i]).length / ps.length) : null; };
  const sf = score('full'), s12 = score('first12'), s24 = score('rows24');
  const flPasses = passes('full').filter((p) => typeof p.value.first_line_answers === 'boolean');
  cells.push({
    arm, id: c.id, n: c.mustHave.length, ok: !raw.is_error && !raw.timed_out && !!raw.result,
    full: sf ? sum(sf) : 0, first12: s12 ? sum(s12) : 0, rows24: s24 ? sum(s24) : 0, rows: renderedRows(text),
    words12: (text.replace(/\r/g, '').split('\n').slice(0, 12).join(' ').match(/\S+/g) || []).length, scored: !!(sf && s12), passesFull: passes('full').length, passesFirst12: passes('first12').length,
    judgeUnknown: (sf ? 0 : c.mustHave.length) + (s12 ? 0 : c.mustHave.length),
    firstLineAnswers: flPasses.length ? flPasses.filter((p) => p.value.first_line_answers).length / flPasses.length : 0,
    a, outTokens: raw.usage?.output_tokens ?? 0, thinkTokens: raw.usage?.output_tokens_details?.thinking_tokens ?? 0,
    replyTokens: Math.round((raw.result ?? '').length / 3.5), wallS: raw.wall_ms / 1000, apiS: (raw.duration_api_ms ?? 0) / 1000,
    turns: raw.num_turns, cost: raw.total_cost_usd ?? 0, denials: raw.permission_denials?.length ?? 0,
    agree: j.agreement,
  });
}
const fixCells = [];
for (const c of cases.fix) for (const arm of ARMS) {
  const raw = load(arm, c.id);
  if (!raw) continue;
  const a = analyze(raw.result ?? '');
  fixCells.push({ arm, id: c.id, pass: !!raw.hidden_check?.pass, reasons: raw.hidden_check?.reasons ?? [], tests: raw.hidden_check?.tests,
    ok: !raw.is_error && !raw.timed_out, a, rows: renderedRows(raw.result ?? ''), outTokens: raw.usage?.output_tokens ?? 0, wallS: raw.wall_ms / 1000, turns: raw.num_turns, cost: raw.total_cost_usd ?? 0 });
}

const armStats = {};
for (const arm of ARMS) {
  const cs = cells.filter((c) => c.arm === arm);
  const fs = fixCells.filter((c) => c.arm === arm);
  const facts = sum(cs.map((c) => c.n));
  armStats[arm] = {
    readCells: cs.length, failedCells: cs.filter((c) => !c.ok).length,
    mustHaveFullPct: pct(sum(cs.map((c) => c.full)), facts),
    mustHaveFirst12Pct: pct(sum(cs.map((c) => c.first12)), facts),
    factsFull: `${sum(cs.map((c) => c.full)).toFixed(1)}/${facts}`, factsFirst12: `${sum(cs.map((c) => c.first12)).toFixed(1)}/${facts}`,
    mustHaveFirst24RowsPct: pct(sum(cs.map((c) => c.rows24)), facts),
    medianRows: median(cs.map((c) => c.rows)), fitsScreenRowsPct: pct(cs.filter((c) => c.rows <= 40).length, cs.length),
    medianWordsFirst12: median(cs.map((c) => c.words12)),
    answerFirstBoldPct: pct(cs.filter((c) => c.a.answerFirst).length, cs.length),
    answerFirstJudgePct: pct(sum(cs.map((c) => c.firstLineAnswers)), cs.length),
    medianLines: median(cs.map((c) => c.a.lines)), medianWords: median(cs.map((c) => c.a.words)),
    walls: sum(cs.map((c) => c.a.walls)), answersWithWall: cs.filter((c) => c.a.walls > 0).length,
    fitsScreenPct: pct(cs.filter((c) => c.a.fitsScreen).length, cs.length),
    medianOutputTokens: median(cs.map((c) => c.outTokens)),
    // Output tokens split: thinking (from usage), the reply itself (estimated at 3.5 chars per token), and the rest (tool calls, interim text).
    avgOutputTokens: Math.round(sum(cs.map((c) => c.outTokens)) / cs.length),
    avgThinkingTokens: Math.round(sum(cs.map((c) => c.thinkTokens)) / cs.length),
    avgReplyTokens: Math.round(sum(cs.map((c) => c.replyTokens)) / cs.length), medianWallS: median(cs.map((c) => c.wallS)),
    medianTurns: median(cs.map((c) => c.turns)),
    costReadUsd: Math.round(1e4 * sum(cs.map((c) => c.cost))) / 1e4,
    costFixUsd: Math.round(1e4 * sum(fs.map((c) => c.cost))) / 1e4,
    fixPassed: fs.length ? `${fs.filter((c) => c.pass).length}/${fs.length}` : 'n/a',
    medianFixLines: fs.length ? median(fs.map((c) => c.a.lines)) : null, medianFixRows: fs.length ? median(fs.map((c) => c.rows)) : null,
    fixAnswerFirstBoldPct: fs.length ? pct(fs.filter((c) => c.a.answerFirst).length, fs.length) : null,
    permissionDenials: sum(cs.map((c) => c.denials)),
  };
}

// Paired per-case comparison, skim vs each other arm.
const paired = {};
for (const other of ARMS.filter((a) => a !== 'skim')) {
  const row = { fullWTL: [0, 0, 0], first12WTL: [0, 0, 0], first24RowsWTL: [0, 0, 0], shorterLines: [0, 0, 0], shorterRows: [0, 0, 0] };
  for (const c of cases.read) {
    const s = cells.find((x) => x.arm === 'skim' && x.id === c.id), o = cells.find((x) => x.arm === other && x.id === c.id);
    if (!s || !o) continue;
    const cmp = (a, b, key, lowerBetter = false) => { const d = lowerBetter ? b - a : a - b; row[key][d >= 0.5 ? 0 : d <= -0.5 ? 2 : 1]++; };
    cmp(s.full, o.full, 'fullWTL'); cmp(s.first12, o.first12, 'first12WTL'); cmp(s.rows24, o.rows24, 'first24RowsWTL'); cmp(s.a.lines, o.a.lines, 'shorterLines', true); cmp(s.rows, o.rows, 'shorterRows', true);
  }
  paired[`skim_vs_${other}`] = row;
}
const totalRunCost = sum(cells.map((c) => c.cost)) + sum(fixCells.map((c) => c.cost));
const passCounts = cells.flatMap((c) => [c.passesFull, c.passesFirst12]);
const meta = { date: DATE, judgeModel: judgedFile.judgeModel, judgePasses: judgedFile.passes, judgePassesCompleted: { min: Math.min(...passCounts), max: Math.max(...passCounts) }, judgeCostUsd: Math.round(1e4 * (judgedFile.cost + (judgedFile.extraJudgeCost ?? 0))) / 1e4, judgeFailedCalls: judgedFile.failed,
  runCostUsd: Math.round(1e4 * totalRunCost) / 1e4 };
const perCase = cells.map(({ arm, id, n, full, first12, rows24, rows, passesFull, passesFirst12, a, outTokens, wallS, turns, cost, agree, firstLineAnswers, judgeUnknown, denials }) =>
  ({ arm, case: id, facts: n, full: Math.round(100 * full) / 100, first12: Math.round(100 * first12) / 100, judgePasses: [passesFull, passesFirst12], lines: a.lines, renderedRows: rows, first24RowsFacts: Math.round(100 * rows24) / 100, words: a.words, answerFirstBold: a.answerFirst, firstLineAnswersJudge: firstLineAnswers, walls: a.walls, tables: a.tables, outTokens, wallS: Math.round(wallS), turns, costUsd: Math.round(1e4 * cost) / 1e4, judgeAgreement: agree, judgeUnknown, denials }));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ meta, arms: armStats, paired, perCase, fix: fixCells.map(({ a, ...r }) => ({ ...r, lines: a.lines, answerFirstBold: a.answerFirst })) }, null, 2));

// ---------- REPORT.md ----------
const f = (v, d = 1) => (v === null || v === undefined ? 'n/a' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : v);
const row = (label, key, fmt = (v) => f(v)) => `| ${label} | ${ARMS.map((a) => fmt(armStats[a][key])).join(' | ')} |`;
const money = (v) => `$${v.toFixed(2)}`;
const L = [];
L.push(`# skim eval report (${DATE})`, '');
L.push(`Question: does the skim output style make replies faster to skim **without dropping facts or hurting work quality**, compared with Claude Code's default style and its built-in Concise style?`);
L.push('', `Setup: Claude Code \`opus\` (one run per cell), 10 read-only prompts x ${ARMS.length} arms, plus 3 fix tasks x ${ARMS.length - 1} arms (all but concise). Facts judged by a blind \`${meta.judgeModel}\` judge (${meta.judgePassesCompleted.min === meta.judgePassesCompleted.max ? meta.judgePassesCompleted.min : meta.judgePassesCompleted.min + ' to ' + meta.judgePassesCompleted.max} independent passes per answer; a fact scores the share of passes that found it). n=1 per cell: read the numbers as a pilot, not a verdict (see \`evals/README.md\`).`, '');
L.push('## Headline (10 read-only prompts per arm)', '');
L.push(`| Metric | ${ARMS.join(' | ')} |`, `|---|${ARMS.map(() => '---').join('|')}|`);
L.push(row('mustHave facts kept, full answer', 'mustHaveFullPct', (v) => `${f(v)}%`).replace(/\|$/, '|'));
L.push(`| &nbsp;&nbsp;(count) | ${ARMS.map((a) => armStats[a].factsFull).join(' | ')} |`);
L.push(row('mustHave facts in first 12 source lines', 'mustHaveFirst12Pct', (v) => `${f(v)}%`));
L.push(`| &nbsp;&nbsp;(count) | ${ARMS.map((a) => armStats[a].factsFirst12).join(' | ')} |`);
L.push(row(`mustHave facts in first 24 rendered rows (${COLS} cols, 1 judge pass)`, 'mustHaveFirst24RowsPct', (v) => `${f(v)}%`));
L.push(row('words in the first 12 source lines (median)', 'medianWordsFirst12'));
L.push(row('answer-first, line 1 is bold (analyze.mjs)', 'answerFirstBoldPct', (v) => `${f(v)}%`));
L.push(row('answer-first, judge says line 1 answers', 'answerFirstJudgePct', (v) => `${f(v)}%`));
L.push(row('median source lines', 'medianLines'));
L.push(row(`median rendered rows at ${COLS} cols (long lines wrap)`, 'medianRows'));
L.push(row('median words (outside code blocks)', 'medianWords'));
L.push(row('wall-of-text paragraphs (total)', 'walls'));
L.push(row('fit one screen, <=40 source lines', 'fitsScreenPct', (v) => `${f(v)}%`));
L.push(row('fit one screen, <=40 rendered rows', 'fitsScreenRowsPct', (v) => `${f(v)}%`));
L.push(row('median output tokens (whole run)', 'medianOutputTokens'));
L.push(row('avg output tokens per question (whole run)', 'avgOutputTokens'));
L.push(row('&nbsp;&nbsp;of which thinking', 'avgThinkingTokens'));
L.push(row('&nbsp;&nbsp;of which the reply you read (~chars/3.5)', 'avgReplyTokens'));
L.push(row('median wall time (s)', 'medianWallS', (v) => f(v, 0)));
L.push(row('median turns', 'medianTurns'));
L.push(row('cost, read-only runs', 'costReadUsd', money));
L.push(row('fix tasks passed (hidden check)', 'fixPassed'));
L.push('', '"Answer-first, line 1 is bold" is the exact test skim\'s own rule is written to satisfy, so it is partly circular. The judge column asks a neutral question: does line 1 alone give the answer?', '');

L.push('## Skim vs the others, case by case (win / tie / loss for skim)', '');
L.push('| Comparison | facts, full | facts, first 12 lines | facts, first 24 rows | fewer lines | fewer rows |', '|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(paired)) L.push(`| ${k.replace('_', ' ').replace('_', ' ')} | ${v.fullWTL.join(' / ')} | ${v.first12WTL.join(' / ')} | ${v.first24RowsWTL.join(' / ')} | ${v.shorterLines.join(' / ')} | ${v.shorterRows.join(' / ')} |`);
L.push('', '## Per case (facts full / facts in first 12 lines / lines / output tokens)', '');
L.push(`| Case | facts | ${ARMS.join(' | ')} |`, `|---|---|${ARMS.map(() => '---').join('|')}|`);
for (const c of cases.read) {
  const cellTxt = (arm) => { const x = cells.find((y) => y.arm === arm && y.id === c.id); return x ? `${x.full.toFixed(1)} / ${x.first12.toFixed(1)} / ${x.a.lines}L / ${x.outTokens}t` : 'n/a'; };
  L.push(`| ${c.id} | ${c.mustHave.length} | ${ARMS.map(cellTxt).join(' | ')} |`);
}
L.push('', '## Fix tasks (hidden check: behaviour + existing tests green + a test added)', '');
const FIX_ARMS = ARMS.filter((a) => a !== 'concise');
L.push(`| Task | ${FIX_ARMS.join(' | ')} |`, `|---|${FIX_ARMS.map(() => '---').join('|')}|`);
for (const c of cases.fix) {
  const t = (arm) => { const x = fixCells.find((y) => y.arm === arm && y.id === c.id); return x ? `${x.pass ? 'PASS' : 'FAIL'} (${x.tests?.total ?? '?'} tests, ${x.turns} turns, ${money(x.cost)})${x.pass ? '' : ' - ' + x.reasons.slice(0, 2).join('; ')}` : 'n/a'; };
  L.push(`| ${c.id} | ${FIX_ARMS.map(t).join(' | ')} |`);
}
L.push('', `Fix-task final messages, median source lines: ${FIX_ARMS.map((a) => `${a} ${f(armStats[a].medianFixLines)}`).join(', ')}; median rendered rows: ${FIX_ARMS.map((a) => `${a} ${f(armStats[a].medianFixRows)}`).join(', ')}.`, '');
L.push('## Cost', '', `| Item | USD |`, `|---|---|`);
L.push(`| Runs, all arms (sum of total_cost_usd) | ${money(meta.runCostUsd)} |`, `| Judge (${meta.judgeModel}, ${meta.judgePasses} passes, plus 1 pass for the 24-row window) | ${money(meta.judgeCostUsd)} |`, `| **Total** | **${money(meta.runCostUsd + meta.judgeCostUsd)}** |`, '', 'About $0.22 more went on development probes before the run (one skim smoke test and two judge-cost tests); it is not in the total above.', '');
const agreeVals = cells.flatMap((c) => [c.agree?.full, c.agree?.first12]).filter((v) => typeof v === 'number');
L.push(`Judge consistency: per-fact agreement between passes averaged ${f(100 * sum(agreeVals) / (agreeVals.length || 1))}%. Judge calls that failed to return usable JSON: ${meta.judgeFailedCalls}.`, '');
const notes = join(OUT, 'notes.md');
if (existsSync(notes)) L.push(readFileSync(notes, 'utf8').trim(), '');
L.push('## Files', '', '- `raw/<arm>/<case>.json`: full `claude -p` JSON (answer, usage, cost, timings, permission denials, hidden-check result)', '- `answers/<arm>/<case>.md`: the answer text exactly as returned', '- `patches/<arm>/<case>.patch`: what each fix run changed', '- `judged.json`: per-fact judge verdicts, every pass', '- `summary.json`: all numbers above, plus per-cell detail', '');
writeFileSync(join(OUT, 'REPORT.md'), L.join('\n'));
console.log(L.join('\n'));

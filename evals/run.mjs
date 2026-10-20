#!/usr/bin/env node
// Runs every (arm, case) cell once, each in a fresh temp copy of the fixture.
//   node evals/run.mjs [--date 2026-10-20] [--arms default,concise,skim] [--only id,id] [--concurrency 4] [--budget 20] [--plugin-dir <dir>] [--force]
// Raw output is saved under evals/results/<date>/{raw,answers,patches}/<arm>/<case>.*
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, 'fixture');
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
// --plugin-dir lets a variant of the plugin (a copy with edited rules) run as the skim arm.
const PLUGIN_DIR = opt('plugin-dir', join(here, '..'));
const DATE = opt('date', '2026-10-20');
const ARMS = opt('arms', 'default,concise,skim').split(',');
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const CONCURRENCY = Number(opt('concurrency', 4));
const BUDGET = Number(opt('budget', 20));
const FORCE = args.includes('--force');
const TIMEOUT_MS = 5 * 60_000;
const OUT = join(here, 'results', DATE);

// Flags that do not change how the model answers, shared by all arms:
//  --no-session-persistence: do not litter ~/.claude with 40 throwaway sessions
//  disableAllHooks: the skim plugin's Stop hook would otherwise append eval rows to the user's real /skim-stats log
const COMMON = ['--model', 'opus', '--output-format', 'json', '--no-session-persistence'];
// An installed skim would force its style on every arm, so it is switched off; the skim arm loads this repo with --plugin-dir.
const settings = (extra = {}) => JSON.stringify({ disableAllHooks: true, enabledPlugins: { 'skim@skim': false }, ...extra });
const ARM_FLAGS = {
  default: ['--settings', settings()],
  concise: ['--settings', settings({ outputStyle: 'Concise' })],
  // Plugin styles are namespaced plugin:style, and skim doesn't force itself, so the arm selects it.
  skim: ['--plugin-dir', PLUGIN_DIR, '--settings', settings({ outputStyle: 'skim:skim' })],
};
const READ_TOOLS = ['--allowedTools', 'Read,Grep,Glob'];
const FIX_TOOLS = ['--allowedTools', 'Read,Grep,Glob,Edit,Write,Bash(node:*)', '--permission-mode', 'acceptEdits'];

const jobs = [];
for (const c of cases.read) for (const arm of ARMS) jobs.push({ arm, kind: 'read', c });
for (const c of cases.fix) for (const arm of ARMS.filter((a) => a !== 'concise')) jobs.push({ arm, kind: 'fix', c });
const selected = jobs.filter((j) => !ONLY || ONLY.includes(j.c.id));

const rawPath = (j) => join(OUT, 'raw', j.arm, `${j.c.id}.json`);
let spent = 0;
const sumExisting = () => {
  for (const j of jobs) if (existsSync(rawPath(j))) spent += JSON.parse(readFileSync(rawPath(j), 'utf8')).total_cost_usd ?? 0;
};

function runClaude(argv, cwd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('claude', argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut, wall_ms: Date.now() - t0 }); });
  });
}

async function runJob(j) {
  const dir = mkdtempSync(join(tmpdir(), `skim-eval-${j.arm}-${j.c.id}-`));
  const work = join(dir, 'reminder-service');
  cpSync(FIXTURE, work, { recursive: true }); // hidden checks live in evals/hidden and are never copied
  const argv = ['-p', j.c.prompt, ...COMMON, ...ARM_FLAGS[j.arm], ...(j.kind === 'fix' ? FIX_TOOLS : READ_TOOLS)];
  const r = await runClaude(argv, work);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* keep raw */ }
  const rec = {
    arm: j.arm, case: j.c.id, kind: j.kind, prompt: j.c.prompt,
    wall_ms: r.wall_ms, timed_out: r.timedOut, exit_code: r.code,
    stderr: r.stderr.slice(0, 2000),
    ...(parsed ?? { parse_error: true, stdout: r.stdout.slice(0, 5000) }),
  };
  if (j.kind === 'fix') {
    const chk = spawnSync('node', [join(here, 'hidden', 'check.mjs'), j.c.check, work], { encoding: 'utf8', timeout: 120_000 });
    try { rec.hidden_check = JSON.parse(chk.stdout.trim().split('\n').pop()); } catch { rec.hidden_check = { pass: false, reasons: ['check output unreadable: ' + (chk.stderr || chk.stdout).slice(0, 500)] }; }
    const diff = spawnSync('diff', ['-ruN', FIXTURE, work], { encoding: 'utf8' });
    mkdirSync(join(OUT, 'patches', j.arm), { recursive: true });
    writeFileSync(join(OUT, 'patches', j.arm, `${j.c.id}.patch`), diff.stdout);
  }
  mkdirSync(dirname(rawPath(j)), { recursive: true });
  writeFileSync(rawPath(j), JSON.stringify(rec, null, 2));
  mkdirSync(join(OUT, 'answers', j.arm), { recursive: true });
  writeFileSync(join(OUT, 'answers', j.arm, `${j.c.id}.md`), (rec.result ?? '(no result)') + '\n');
  rmSync(dir, { recursive: true, force: true });
  return rec;
}

sumExisting();
const queue = selected.filter((j) => FORCE || !existsSync(rawPath(j)));
console.log(`cells: ${selected.length}, to run: ${queue.length}, already spent $${spent.toFixed(2)}, budget $${BUDGET}`);
let stopped = false;
async function worker() {
  while (queue.length) {
    if (spent >= BUDGET) { if (!stopped) console.log(`BUDGET STOP: spent $${spent.toFixed(2)} >= $${BUDGET}`); stopped = true; return; }
    const j = queue.shift();
    const rec = await runJob(j);
    spent += rec.total_cost_usd ?? 0;
    const flag = rec.timed_out ? ' TIMEOUT' : rec.is_error ? ' ERROR' : '';
    const chk = rec.hidden_check ? ` check=${rec.hidden_check.pass ? 'PASS' : 'FAIL'}` : '';
    console.log(`${j.arm.padEnd(8)} ${j.c.id.padEnd(26)} ${(rec.wall_ms / 1000).toFixed(0).padStart(4)}s  $${(rec.total_cost_usd ?? 0).toFixed(3)}  out=${rec.usage?.output_tokens ?? '?'}  denials=${rec.permission_denials?.length ?? '?'}${chk}${flag}  [total $${spent.toFixed(2)}]`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done. total spent (runs) $${spent.toFixed(2)}`);

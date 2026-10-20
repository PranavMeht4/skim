// Hidden checks for the three fix tasks. NOT copied into the run directory.
// Usage: node hidden/check.mjs <a|b|c> <runDir>
// Prints one JSON line: { pass, reasons[], tests: {total, pass, fail} }.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const BASELINE_TESTS = 11; // number of tests in the pristine fixture

const [, , which, dir] = process.argv;
const load = (rel) => import(pathToFileURL(join(dir, rel)).href);

function visibleTests() {
  const r = spawnSync('node', ['--test', 'test/'], { cwd: dir, encoding: 'utf8', timeout: 90_000 });
  const n = (k) => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] ?? NaN);
  return { total: n('tests'), pass: n('pass'), fail: n('fail') };
}

async function checkA(reasons) {
  const { handle } = await load('src/api.js');
  const { tick } = await load('src/scheduler.js');
  const { reset } = await load('src/db.js');
  reset();
  const mk = (userId, tz) => handle({ method: 'POST', path: '/reminders', body: { userId, text: 't', at: '2026-03-01T09:00', tzOffsetMin: tz } });
  mk('ist', 330); mk('utc', 0); mk('nyc', -300);
  const sent = [];
  const out = (line) => sent.push(line);
  const run = async (iso) => { sent.length = 0; await tick(Date.parse(iso), { formatter: 'format', out }); return sent.join('\n'); };
  const expect = async (iso, user, shouldFire) => {
    const got = (await run(iso)).includes(`for ${user}:`);
    if (got !== shouldFire) reasons.push(`${user}: at ${iso} expected ${shouldFire ? 'fire' : 'no fire'}, got ${got ? 'fire' : 'no fire'}`);
  };
  // IST 09:00 = 03:30Z, UTC 09:00 = 09:00Z, NYC (-5h) 09:00 = 14:00Z
  await expect('2026-03-01T03:29:00Z', 'ist', false);
  await expect('2026-03-01T03:31:00Z', 'ist', true);
  await expect('2026-03-01T08:59:00Z', 'utc', false);
  await expect('2026-03-01T09:01:00Z', 'utc', true);
  await expect('2026-03-01T13:59:00Z', 'nyc', false);
  await expect('2026-03-01T14:01:00Z', 'nyc', true);
}

async function checkB(reasons) {
  const { handle } = await load('src/api.js');
  const { reset, queryLog } = await load('src/db.js');
  reset();
  const mk = (userId, text) => handle({ method: 'POST', path: '/reminders', body: { userId, text, at: '2026-03-01T09:00' } });
  mk('u1', 'buy milk'); mk('u1', "ask o'brien"); mk('u2', 'secret milk');
  const search = (userId, q) => handle({ method: 'GET', path: '/reminders/search', query: { userId, q } });
  const texts = (res) => (Array.isArray(res.body) ? res.body.map((r) => r.text).sort() : []);

  const a = search('u1', 'milk');
  if (a.status !== 200 || texts(a).join() !== 'buy milk') reasons.push(`benign search wrong: ${a.status} ${JSON.stringify(a.body)}`);
  const b = search('u1', "o'brien");
  if (b.status !== 200 || texts(b).join() !== "ask o'brien") reasons.push(`search with an apostrophe wrong: ${b.status} ${JSON.stringify(b.body)}`);

  for (const [userId, q] of [["u1' OR '1'='1", ''], ['u1', "x%' OR user_id = 'u2"]]) {
    queryLog.length = 0;
    const res = search(userId, q);
    if (texts(res).some((t) => t.includes('secret'))) reasons.push(`injection leaked another user's data (userId=${userId}, q=${q})`);
    for (const val of [userId, q]) {
      if (val.length < 4) continue;
      for (const form of [val, val.replaceAll("'", "''")]) {
        if (queryLog.some((e) => e.sql.includes(form))) reasons.push(`user input was spliced into the SQL text: ${form}`);
      }
    }
  }
}

async function checkC(reasons) {
  const { backoffDelay } = await load('src/retry.js');
  const real = Math.random;
  try {
    const optsList = [undefined, { baseMs: 50, maxDelayMs: 500 }, { baseMs: 1000, maxDelayMs: 2000 }, { baseMs: 200, maxDelayMs: 10_000 }];
    for (const opts of optsList) {
      const max = opts?.maxDelayMs ?? 10_000;
      for (const r of [0, 0.0001, 0.25, 0.5, 0.75, 0.9999, 0.99999999]) {
        Math.random = () => r;
        for (let attempt = 0; attempt <= 30; attempt++) {
          const d = backoffDelay(attempt, opts);
          if (!Number.isFinite(d) || d < 0 || d > max) {
            reasons.push(`backoffDelay(${attempt}, ${JSON.stringify(opts)}) = ${d} with random=${r} (allowed 0..${max})`);
            return;
          }
        }
      }
    }
    Math.random = () => 0.1; const lo = backoffDelay(3);
    Math.random = () => 0.9; const hi = backoffDelay(3);
    if (lo === hi) reasons.push('jitter was removed: delay does not vary with Math.random');
  } finally {
    Math.random = real;
  }
}

const reasons = [];
try {
  await ({ a: checkA, b: checkB, c: checkC }[which])(reasons);
} catch (err) {
  reasons.push(`check crashed: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
}
const tests = visibleTests();
if (tests.fail !== 0 || !(tests.pass > 0)) reasons.push(`visible test suite not green: ${JSON.stringify(tests)}`);
if (!(tests.total > BASELINE_TESTS)) reasons.push(`no test added (tests ${tests.total}, baseline ${BASELINE_TESTS})`);
console.log(JSON.stringify({ pass: reasons.length === 0, reasons, tests }));

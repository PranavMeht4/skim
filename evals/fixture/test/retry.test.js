import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../src/retry.js';

let realRandom;
beforeEach(() => { realRandom = Math.random; Math.random = () => 0.5; }); // no jitter
afterEach(() => { Math.random = realRandom; });

test('returns the result without retrying when the first call works', async () => {
  let calls = 0;
  const out = await withRetry(async () => { calls++; return 'ok'; }, { baseMs: 1 });
  assert.equal(out, 'ok');
  assert.equal(calls, 1);
});

test('retries until the call works', async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    if (++calls < 3) throw new Error('boom');
    return 'ok';
  }, { attempts: 3, baseMs: 1 });
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
});

test('throws the last error after the final attempt', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { throw new Error(`fail ${++calls}`); }, { attempts: 2, baseMs: 1 }),
    /fail 2/,
  );
});

**It adds jitter so that many failing sends don't all retry at the same moment (`src/retry.js:2`). The implementation is not right: it can bring back the very pile-up it exists to prevent.**

1. **Negative delays, so a burst of instant retries.** The jitter is a fixed ±500ms (`src/retry.js:4,8`), but the first backoff is only 200ms. Attempt 0 gives a delay of `200 + (r−0.5)·1000`, a range of **−300 to 700ms**. Node turns any delay below 1 into **1ms**.
   - About **30% of first retries** fire after 1ms, all together. About **10% of second retries** do the same (range −100 to 900ms).
2. **Jitter swamps the backoff.** With the default `attempts = 3`, only the 200ms and 400ms sleeps ever run, and ±500ms is bigger than both. The jitter also ignores `baseMs`: a caller passing `baseMs: 1` can still sleep about 500ms.
3. **The tests hide it.** `test/retry.test.js:6` pins `Math.random` to 0.5, so the jitter is always 0, and no test calls `backoffDelay` directly. With `Math.random = () => 0`, `backoffDelay(0)` returns **−300**.
4. **Fix:** scale the jitter with the backoff ("equal jitter"), which keeps the delay between `exp/2` and `exp`:

```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2);
}
```

- **Don't** fix it with `Math.max(0, …)`. The 30% would still pile up, just at 0ms instead of 1ms.
- The existing tests would still pass, but the `// no jitter` comment at `test/retry.test.js:6` would become wrong (at 0.5 the delay is `0.75·exp`). Add a test that calls `backoffDelay` with `Math.random` set to 0 and to 1.

**Also:**
- Once `attempt ≥ 6`, the delay can overshoot `maxDelayMs` by up to 500ms. That can't happen at the default `attempts = 3`.
- **Not run:** my sampling script and `node --test` needed approval, so neither ran. The figures above come from the arithmetic, not from a run. I didn't edit any files.

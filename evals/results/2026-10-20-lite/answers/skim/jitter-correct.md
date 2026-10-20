**Jitter is there to stop many failing sends from retrying at the same moment (a thundering herd). The idea is right, but the implementation is not: it adds a fixed ±500 ms, not an amount that scales with the delay.**

1. **Delays can be negative** (`src/retry.js:8-9`). With the default `baseMs = 200`, the first retry lands anywhere from **−300 to 700 ms**. About **30%** of first retries and **10%** of second retries come out ≤ 0. Node's `setTimeout` treats those as about 1 ms, so they all fire at once. That re-creates the very burst jitter is supposed to prevent.
2. **The jitter shrinks relative to the delay.** At the 10 s cap, ±500 ms is only **±5%**, so late retries still cluster.
3. **The cap is exceeded.** The delay can reach `maxDelayMs + 500` (**10.5 s**).
4. **The jitter ignores `baseMs`.** With `baseMs: 1`, almost the whole delay is noise. The tests hide this by pinning `Math.random = () => 0.5` (`test/retry.test.js:6`), so **no test checks the jitter at all**.

**Fix:** use "full jitter" (AWS's standard approach). The delay then always stays between 0 and the cap, and the spread grows with the backoff:
```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.random() * exp;
}
```
After this change, `Math.random = () => 0.5` gives half the exponential delay instead of no jitter. The existing tests still pass that way, but the "no jitter" comment would be wrong.

I worked out the numbers above by hand. My simulation script was blocked at the approval prompt, and I did **not** run the test suite.

**Also:**
- `withRetry` retries **every** error, including ones that will never succeed, such as 4xx responses.
- `attempts: 0` makes it throw `undefined`.

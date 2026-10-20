**Purpose is right; the implementation is not.** Jitter stops failed sends from retrying in sync (`src/retry.js:2`).

The bug: jitter is a **fixed ±500 ms** (`JITTER_MS`, `retry.js:4,8`), not scaled to the backoff:
1. **Negative delays at low attempts.** Attempt 0 is 200 ms ± 500, so the range is **−300 to 700 ms**. About **30%** of first retries go negative, and about **10%** of second retries do. Node clamps these to ~1 ms, so they all fire at once. That recreates the herd that jitter is meant to prevent.
2. **The default config only hits those cases.** With `attempts = 3`, only attempts 0 and 1 sleep, which are the two broken ones.
3. **Too little spread at the cap.** At 10 s, ±500 ms is only ±5%. Delays can also reach **10.5 s**, past `maxDelayMs`.

**Fix:** scale the jitter to the delay ("full jitter"). The result is always between 0 and `maxDelayMs`:
```js
const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
return Math.random() * exp;            // or: exp / 2 + Math.random() * exp / 2
```
The second form ("equal jitter") keeps a minimum wait of half the backoff.

**Tests miss this:** `test/retry.test.js:6` pins `Math.random` to 0.5, so jitter is always 0 there. No test checks that delays are ≥ 0 or ≤ `maxDelayMs`.

**Not verified:** the 30% and 10% figures come from the math (`random < 0.3` and `random < 0.1`). My simulation script needed approval and didn't run.

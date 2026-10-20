**No. Adding jitter is right, but a fixed ±500 ms breaks it.**
- **Why:** it stops failing sends from all retrying at the same moment (`src/retry.js:2`)
- ⛔ **Negative delays:** 30% of 1st retries and 10% of 2nd fire at ~1 ms (`src/retry.js:8`)
- ⚠ **Not scaled:** ±500 ms is ±250% of a 200 ms delay but only ±5% at the 10 s cap
- **Fix:** use full jitter, `Math.random() * exp`. It is never negative and never over the cap.
- **Also:** the tests pin `Math.random` to 0.5, so jitter is never tested

───

**The math.** The jitter is `(Math.random() - 0.5) * 1000`, a flat ±500 ms. It doesn't grow with the delay. With the defaults (`baseMs = 200`, `maxDelayMs = 10_000`):

| attempt | backoff | final delay | chance ≤ 0 |
|---|---|---|---|
| 0 | 200 ms | −300 … 700 ms | **30%** |
| 1 | 400 ms | −100 … 900 ms | **10%** |
| 2 | 800 ms | 300 … 1300 ms | 0% |
| ≥ 6 | 10 000 ms (cap) | 9500 … 10 500 ms | 0% |

**Why negative delays hurt.** `setTimeout` treats any delay under 1 ms as 1 ms. So about 30% of failing sends retry almost at once, all together. That is the stampede jitter is meant to prevent. The default is `attempts = 3`, so only the sleeps after attempts 0 and 1 ever run. Those are exactly the two rows that go negative.

**At the cap.** Delays can reach 10.5 s, which is past `maxDelayMs`. All clients also land in the same 1 s window around 10 s, so the spread is weak.

**Suggested fix.** This is "full jitter": the delay is uniform in [0, exp). It can still be close to 0, but only rarely and spread evenly, with no pile-up at 1 ms. `JITTER_MS` goes away.

```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.random() * exp;
}
```

The trade-off is that the average wait is half as long. If you want a minimum wait, use "equal jitter" instead: `exp / 2 + Math.random() * exp / 2`.

**Tests.** `Math.random = () => 0.5` makes the jitter exactly 0 today (`test/retry.test.js:6`). After the fix, 0.5 gives `exp / 2`. The existing tests would still pass because they use `baseMs: 1`, but the "no jitter" comment would be wrong. There is no test for `backoffDelay` itself. Worth adding: with `Math.random` set to 0 and to 0.999, check the delay stays in [0, exp] and never goes over `maxDelayMs`.

**Not verified by running.** My command to sample `backoffDelay` and run the tests was denied, so I didn't run anything. The numbers above are worked out by hand from the code.

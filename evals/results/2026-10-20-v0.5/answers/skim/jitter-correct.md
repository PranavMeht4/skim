**Jitter is there so that many failed sends don't all retry at the same moment. The way it's implemented is partly wrong, and in this deployment it barely helps.**

1. **Negative delays:** the jitter is a fixed **±500 ms** (`src/retry.js:8`), but the first backoffs are only 200 and 400 ms. About **30%** of first retries and **10%** of second retries get a delay below 0. Node runs those after **1 ms**, so the retry is instant, which defeats the backoff.
2. **Doesn't scale with the delay:** ±500 ms is larger than the short delays, but only ±5% at the 10 s cap.
3. **Can exceed `maxDelayMs`:** delays can reach **10,500 ms** (`src/retry.js:9`). Today's only caller (`attempts: 5`, `src/scheduler.js:16`) never gets near the cap, because its largest backoff is 1,600 ms.
4. **Never tested:** the tests fix `Math.random` at 0.5 (`test/retry.test.js:6`), which makes jitter always 0, and nothing tests `backoffDelay` directly. That's how #1 went unnoticed.
5. **Little benefit here:** the scheduler sends **one reminder at a time** (`await` in the loop, `src/scheduler.js:14-16`), and the README says **one process, no second instance** (`README.md:14`). There's never a crowd of retries to spread out.

**Fix:** scale the jitter to the delay and remove `JITTER_MS`:

```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2); // "equal jitter": always in [exp/2, exp]
}
```

This can't go negative, never goes over the cap, and always waits at least half the backoff. "Full jitter" (`Math.random() * exp`) is the other common choice, but it can still produce near-zero waits. Also add a test that sets `Math.random` to 0 and to just under 1 and checks the delay stays within those bounds.

Delay ranges for today's 4 retries:

| Retry | Backoff | Current delay | With fix |
|---|---|---|---|
| 1 | 200 ms | −300 to 700 ms | 100 to 200 ms |
| 2 | 400 ms | −100 to 900 ms | 200 to 400 ms |
| 3 | 800 ms | 300 to 1,300 ms | 400 to 800 ms |
| 4 | 1,600 ms | 1,100 to 2,100 ms | 800 to 1,600 ms |

**Not verified:** I didn't run the code or the tests because the shell command wasn't approved. The numbers come from working through the code by hand. I haven't edited anything.

**Also:** there's a timezone bug outside retry.js. `due_ms` is already UTC (`toUtcMs`, `src/api.js:16`), but `src/scheduler.js:9` subtracts the user's offset a second time. **IST reminders fire 5h30m early**, and users west of UTC get theirs hours late.

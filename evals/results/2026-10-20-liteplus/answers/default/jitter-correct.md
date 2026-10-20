The jitter is there for a good reason, but the implementation is broken: in the default setup it often removes the backoff it's meant to randomize.

**Why it's there.** The comment in `src/retry.js` gives the reason, and it's sound. If a downstream outage makes many reminder sends fail at once, they would all retry on the same 200 ms → 400 ms → … schedule. That sends synchronized bursts at the service just as it tries to recover (a "thundering herd"). Random jitter spreads those retries out.

**What's wrong.** `src/retry.js:8` adds a fixed ±500 ms, no matter how large the delay is:

```js
const jitter = (Math.random() - 0.5) * JITTER_MS;   // uniform in [-500, 500)
```

With the default `baseMs = 200`:

| Attempt | Base delay | Actual delay range | Chance the delay is ≤ 0 |
|---|---|---|---|
| 0 | 200 | -300 … 700 | ~30% |
| 1 | 400 | -100 … 900 | ~10% |
| 2+ | 800+ | always positive | 0% |

The default `attempts = 3` means only attempts 0 and 1 ever wait before retrying (`attempt < attempts - 1`). So both waits in the default config are affected; this isn't an edge case. Node's `setTimeout` turns any delay below 1 ms into 1 ms, so every negative draw becomes an immediate retry. Those retries all land at the same moment, which is the synchronized burst jitter was supposed to prevent, and they skip the backoff entirely.

Two smaller problems:
- **The cap isn't a cap.** The jitter is added after `Math.min(maxDelayMs, …)`, so a delay can reach about 10,500 ms.
- **The spread is weakest where it matters most.** At the 10 s cap, ±500 ms is only ±5%, so clients that have backed off all the way still retry almost together.

**Why the tests don't catch it.** `test/retry.test.js:6` sets `Math.random` to always return 0.5, which makes the jitter exactly 0. Nothing tests `backoffDelay` directly, so the tests only check how many times it retries, not how long it waits.

**Suggested fix.** Make the jitter proportional to the delay and keep the result within the cap. I'd use "full jitter" (a random delay anywhere between 0 and the backoff). It spreads retries evenly instead of piling some up at zero:

```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.random() * exp;   // uniform in [0, exp), never negative, never above the cap
}
```

If you want every retry to wait at least some time, use "equal jitter" instead: `exp / 2 + Math.random() * (exp / 2)`. Either way, `JITTER_MS` goes away. I'd also add a `backoffDelay` test that sets `Math.random` to `0` and then to `0.999` and checks the result stays between `0` and `maxDelayMs`.

I couldn't run a quick sampling script because the command needed approval, so the percentages above are worked out by hand from the formula. I haven't changed any files. Say if you want me to apply the fix and add the test.

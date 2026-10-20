**Jitter keeps many failing sends from retrying in lockstep, but the implementation is broken: it adds a fixed ±500 ms, which is bigger than the early backoff, so many retries fire immediately.**

**Why jitter:** without it, every send that failed at the same moment (say, the provider went down) retries at exactly 200 ms, then 400 ms, and so on. They hit the recovering service as one burst each time. The comment at `src/retry.js:2` gets this right.

**Cause:** `src/retry.js:8` gives a jitter of `(Math.random() - 0.5) * 1000`, a flat ±500 ms that doesn't scale with the backoff. With the defaults (`baseMs = 200`, `attempts = 3`):

| Attempt | Backoff | Actual delay | Fires at ~0 ms |
|---|---|---|---|
| 0 | 200 | **−300 … 700** | **30%** |
| 1 | 400 | **−100 … 900** | **10%** |
| 2 | 800 | 300 … 1300 | 0% |
| 6+ | 10000 (cap) | 9500 … **10500** | 0% |

- Node treats a negative `setTimeout` delay as 1 ms. So about 30% of first retries pile up at t≈0, which is the thundering herd that jitter is meant to prevent.
- The default `attempts = 3` only sleeps after attempts 0 and 1, so **both** default retries are affected.
- At the cap, ±500 ms is only ±5% of 10 s, so the spread stops growing. Delays can also exceed `maxDelayMs` by up to 500 ms.
- The tests never exercise jitter. `test/retry.test.js:6` pins `Math.random` to 0.5, which makes jitter exactly 0, and nothing tests `backoffDelay` directly.

**Fix:** use "full jitter", a random delay between 0 and the backoff, so the spread grows with the backoff:

```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.random() * exp;
}
```

- This also removes `JITTER_MS`.
- If you want a guaranteed minimum wait, use "equal jitter" instead: `exp / 2 + Math.random() * (exp / 2)`.
- The existing tests would still pass, since 0.5 just gives `exp / 2` with `baseMs: 1`. But the `// no jitter` comment would then be wrong.

**Proof:** I worked out the table above by hand from lines 7–9. I tried to confirm it by sampling `backoffDelay` with a Node script, but that command needed approval and didn't run.

❓ **Needs you:** should I apply full jitter (or equal jitter) and add a `backoffDelay` test that checks every delay is ≥ 0 and ≤ `maxDelayMs`? I haven't changed any files.

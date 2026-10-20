**Why:** to avoid a thundering herd. If a downstream outage makes many reminder sends fail at once, plain exponential backoff has them all retry at the same moments (200 ms, 400 ms, …), which hits the recovering service in synchronized bursts. Random jitter spreads those retries out. The comment at `src/retry.js:2` says the same.

**Is it right?** Partly. It adds randomness, but the jitter is a fixed ±500 ms (`src/retry.js:8`) that doesn't scale with the backoff, which causes three problems:

1. **Delays go negative early on, so retries fire immediately.** With the defaults, attempt 0 is `200 ± 500` ms, a range of −300 to 700 ms. Node treats any delay under 1 ms as 1 ms, so about 30% of first retries happen immediately and about 10% of second retries do. That bunches retries at zero, which is the opposite of what jitter is for.
2. **Jitter swamps the backoff early and barely matters late.** At 200 ms it's ±250%, so the exponential curve is mostly noise. At the 10 s cap it's only ±5%, so clients that keep failing stay closely synchronized.
3. **`maxDelayMs` isn't really a maximum.** Adding jitter after the cap can push the delay to 10.5 s.

The usual fix is "full jitter" (from the AWS backoff article): pick a random delay between 0 and the backoff value. It scales with the backoff, is never negative, and never goes over the cap:

```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.random() * exp;
}
```

If you want a guaranteed minimum wait, use "equal jitter" instead: `exp / 2 + Math.random() * exp / 2`.

Existing tests should still pass with either version. They mock `Math.random` to return 0.5 (`test/retry.test.js:6`), so the delay just becomes half the backoff instead of the full backoff, but the "no jitter" comment there would then be wrong. No test currently checks the delay itself, which is why these problems went unnoticed. I can apply the fix and add a `backoffDelay` test if you want.

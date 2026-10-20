**✓ Jitter is now clamped to `[0, maxDelayMs]`. All 12 tests pass.**
- `src/retry.js:9`: now returns `Math.min(maxDelayMs, Math.max(0, exp + jitter))`.
- `test/retry.test.js:34`: new test. It sets `Math.random` to `0` and expects `0` from `backoffDelay(0, { baseMs: 1 })`. It sets it to `0.999999` and expects `10_000` from `backoffDelay(10, …)`.
- `node --test test/`: **12 pass, 0 fail**.

**Not run:** I didn't confirm the new test fails on the old code, because the command to swap the code back needed approval. By arithmetic, the old code returns `-499` and `~10_500` for those two cases, so both checks would fail.

**Also:** once a delay hits the cap, about half of all retries now land on exactly `maxDelayMs`. That weakens the spreading the jitter is meant to do. Applying the jitter before the cap would avoid it.

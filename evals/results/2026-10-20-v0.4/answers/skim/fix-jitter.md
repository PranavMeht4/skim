**✓ Jitter is now clamped to 0–maxDelayMs. 13/13 tests pass.**
- **Cause:** the code capped the delay at `maxDelayMs` before adding ±500 ms of jitter, not after (`src/retry.js:9`)
- **Fix:** it now clamps the final sum: `Math.min(maxDelayMs, Math.max(0, exp + jitter))`
- **Tests:** two new tests check both limits, including a custom `maxDelayMs: 300`
- **Also:** the jitter is a fixed ±500 ms but `baseMs` is 200, so early retries often land at exactly 0 ms. I left this alone.

───

```
src/retry.js         +1 −1   clamp exp + jitter to [0, maxDelayMs]
test/retry.test.js  +12 −1   import backoffDelay; low and high bound tests
```

- **Existing tests unchanged:** they stub `Math.random` to `0.5`, which gives zero jitter. With zero jitter the clamp returns exactly `exp`, so those tests behave as before.
- **New tests:** they stub `Math.random` to `0` and `1` and check exact values. The old code would have returned `-300` and `10500`, not `0` and `10000`. I worked those numbers out by hand and did not run the new tests against the old code.
- **Early retries at 0 ms:** at attempts 0 and 1, `exp` is 200 or 400 ms. A −500 ms jitter pushes that below zero, and the clamp turns it into 0 ms. Retries that land there all happen at the same moment. Scaling the jitter to `exp` would spread them out, but that's a change in behavior, so it's your call.
- **Run:** `node --test test/` gave 13 pass, 0 fail.

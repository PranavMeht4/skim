**✓ Jitter is now clamped to `[0, maxDelayMs]`. All 13 tests pass with `node --test test/`.**
- `src/retry.js:9`: now returns `Math.min(maxDelayMs, Math.max(0, exp + jitter))`.
- `test/retry.test.js`: 2 new tests set `Math.random` to the jitter extremes. Both failed before the fix (`actual: -300` and `actual: 10499`) and pass now.
- With `Math.random() = 0.5`, the delay is still exactly `exp`, so the existing "no jitter" tests are unaffected.

**Also:** the clamp piles retries up at the edges. With the defaults (`baseMs` 200, ±500ms jitter), about 30% of first retries now fire at exactly 0ms. That works against what jitter is for. Making the jitter proportional (e.g. ±50% of `exp`) would avoid it. That changes the design, so I left it alone.

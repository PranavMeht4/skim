**✓ Jitter is now clamped to [0, maxDelayMs]. All 14 tests pass** (`node --test test/`).

- `src/retry.js:9`: `backoffDelay` now returns `Math.min(maxDelayMs, Math.max(0, exp + jitter))`.
- `test/retry.test.js:34-52`: 3 new tests:
  - lowest jitter on attempt 0 gives **0**
  - highest jitter at the cap gives exactly **maxDelayMs**
  - a sweep over 12 attempts × 5 random values stays in range

**Checked against the old code:** I calculated what it returns for the same inputs: **-300** and **5499**, so these tests would have failed before the fix. I couldn't run the suite against a reverted copy, because the sandbox blocked that command.

**Also:** jitter is a fixed ±500 ms (`JITTER_MS`), whatever `baseMs` is, so the clamp skews the timing at both ends:
- With the default `baseMs = 200`, about **30%** of first retries now fire after 0 ms.
- At the cap, about **half** of retries land exactly on `maxDelayMs`, so retries that reach the cap aren't spread out.

Making the jitter proportional to `exp` would avoid both.

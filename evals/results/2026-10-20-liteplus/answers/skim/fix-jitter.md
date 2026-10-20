**Fixed: `backoffDelay` now clamps the delay to `[0, maxDelayMs]`. `node --test test/` passes all 14 tests, 0 failing.**

1. **Fix** at `src/retry.js:10`: `return Math.min(maxDelayMs, Math.max(0, exp + jitter));`
2. **3 new tests** in `test/retry.test.js`:
   - lowest jitter (`Math.random → 0`, `baseMs: 1`) gives **exactly 0**. The old code returned **-499**.
   - highest jitter on a capped attempt gives **exactly 10,000**. The old code returned about **10,500**.
   - a sweep over 7 random values × 12 attempts stays **within bounds**.
3. I didn't run the new tests against the old code. The comparison in item 2 is from working through the old formula by hand.

**Trade-off:** once the delay reaches the cap, about **half of retries land exactly on `maxDelayMs`**, so jitter only spreads them below the cap. If that matters, the alternative is to shrink the jitter near the bounds instead of clipping it.

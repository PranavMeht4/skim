**Fixed: the delay is now clamped to `[0, maxDelayMs]` after jitter is added.** All **14/14 tests pass** with `node --test test/`.

1. **Fix** at `src/retry.js:10`: `return Math.min(maxDelayMs, Math.max(0, exp + jitter));`
2. **Bug confirmed before the fix:** with the defaults, attempt 0 could return **-300 ms**, and at the cap it could return **10,499.999 ms**.
3. **3 new tests** in `test/retry.test.js`:
   - lowest jitter gives a delay of **0**
   - highest jitter gives a delay of **maxDelayMs**
   - jitter still spreads delays that fall inside the bounds (±250 at 1600 ms)
4. The first 2 new tests **failed before the fix** and **pass after it**. The other 11 tests still pass.

**Also:**
- **Clamping changes the spread at both ends.** The jitter range is ±500 ms. With `baseMs = 200`, **about 30%** of first retries now wait **0 ms**. At the cap, **about half** of the delays land exactly on `maxDelayMs`. If you want the spread kept at both ends, make the jitter proportional to `exp` instead of a fixed 1000 ms. I didn't make that change.

**✓ Jitter is now kept within `[0, maxDelayMs]`. All 14 tests pass (11 before, plus 3 new).**

**Cause:** `backoffDelay` capped the delay at `maxDelayMs` first, then added ±500 ms of jitter. So the result could be as low as `200 − 500 = −300` or as high as `10_000 + 500`.

**Fix:** the result is clamped after the jitter is added (`src/retry.js:10`):
```js
return Math.min(maxDelayMs, Math.max(0, exp + jitter));
```

| File | Change |
|---|---|
| `src/retry.js` | clamp the result, plus a 1-line comment |
| `test/retry.test.js` | imports `backoffDelay`; 3 new tests |

**New tests:**
- lowest jitter (`Math.random → 0`) gives `0`, not a negative delay
- highest jitter gives exactly `maxDelayMs`, both when the cap is reached through attempts and when the cap is below `baseMs`
- 3,000 random samples over 30 attempts all land in `[0, 2000]`

**Proof:** `node --test test/` → `# pass 14`, `# fail 0`.

**Not run:** I didn't run the new tests against the old code; my command to swap the old line back in was blocked. Working it out by hand, the first two would fail there: −300 instead of 0, and about 10,500 instead of 10,000.

⚠ **Risk:** clamping changes how delays are spread at both ends.
- **Low end:** about 30% of first retries (attempt 0, `baseMs` 200) get a 0 ms delay. Before, they got a negative delay, which `setTimeout` treats as about 1 ms, so the scheduler behaves almost the same.
- **High end:** once the backoff reaches the cap, about half of retries land on exactly `maxDelayMs` together. `scheduler.js:16` (5 attempts, default `baseMs`) peaks at 1,600 ms, below the 10,000 ms cap, so it isn't affected today.

If those clusters matter later, shrinking the jitter near the edges, or "full jitter" (`Math.random() * exp`), would avoid them.

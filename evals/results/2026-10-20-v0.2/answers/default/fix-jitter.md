I fixed the jitter in `src/retry.js` so the delay now always stays between 0 and `maxDelayMs`. I added a test, and `node --test test/` passes all 12 tests.

**The bug:** `backoffDelay` adds up to ±500ms of random jitter after capping the delay at `maxDelayMs`. Two things went wrong:
- With a small `baseMs`, the delay could go negative (e.g. `baseMs: 1` gave about -499ms).
- Once the delay hit the cap, jitter could push it up to 500ms past `maxDelayMs`.

**The fix** (`src/retry.js:10`): the delay is now clamped after the jitter is added:
```js
return Math.min(maxDelayMs, Math.max(0, exp + jitter));
```

**The test** (`test/retry.test.js:34`): it fakes the random number to get the largest jitter each way. It checks that a tiny delay with the most negative jitter returns exactly `0`, and a capped delay with the most positive jitter returns exactly `10_000`. The file's existing `afterEach` puts the real `Math.random` back afterwards.

One side effect: when the delay is at the cap, jitter can now only lower it. Retries that hit the cap will spread out below `maxDelayMs` instead of around it.

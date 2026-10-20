**Fixed: `backoffDelay` now clamps the delay to `[0, maxDelayMs]`. `node --test test/` passes 12/12.**

1. **Fix** (`src/retry.js:9`): `return Math.min(maxDelayMs, Math.max(0, exp + jitter));`
2. **New test** (`test/retry.test.js:34`): it checks the lowest jitter (expects `0`), the highest jitter at the cap (expects `10_000`) and 3,000 random samples.
3. **The test catches the bug:** before the fix it failed with `-499 !== 0`. After the fix it passes.

**Also:** clamping makes delays **bunch up at the bounds**. With the defaults (`baseMs` 200, jitter ±500), about **30% of first retries** and **10% of second retries** now come out as **exactly 0 ms**. Retries that reach the cap would land exactly on `maxDelayMs` about half the time. `scheduler.js` only uses 5 attempts, so it **never reaches** the 10 s cap, and only the bunching at 0 affects it today. To keep the spread, the jitter window could be shrunk so it always stays inside the bounds. That would change the "`Math.random = 0.5` means no jitter" assumption the existing tests rely on, so I **didn't** make that change.

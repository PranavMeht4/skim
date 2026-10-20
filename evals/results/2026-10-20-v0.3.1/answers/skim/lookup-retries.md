**5 attempts per tick**, hardcoded at `src/scheduler.js:16` (`withRetry(..., { attempts: 5 })`).

- That overrides the **default of 3** in `src/retry.js:14`.
- It is **not in `config.json`**. You can only change it in code.
- Between attempts it waits about **200, 400, 800 and 1600 ms**, each ±500 ms of jitter (`src/retry.js:6-9`). One tick's retries finish in about **3 s**.
- It **never gives up for good.** After 5 failures it logs `reminder <id> failed: …` and leaves `sent = 0` (`src/scheduler.js:18-20`). The next tick tries 5 more times.
- Ticks run every **30 s**, from `tickSeconds` in `config.json:2` (passed in at `src/index.js:6`). So a reminder that always fails is retried and logged forever.

**Also:** the jitter (±500 ms) is bigger than the first two delays. The first wait can come out negative, which `setTimeout` runs as about 0 ms (`src/retry.js:8`).

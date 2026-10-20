**5 attempts per tick**, set by `{ attempts: 5 }` in `src/scheduler.js:16`.

- That overrides the **default of 3** in `withRetry` (`src/retry.js:14`).
- It is not in `config.json`. Changing it means editing the code.
- The service **never fully gives up**. After 5 failures, the reminder stays `sent = 0` (`src/scheduler.js:18-20`). The next tick tries it 5 more times. Ticks run every 30 s by default (`src/scheduler.js:25`), so a broken reminder is retried forever.
- The waits between the 5 attempts are about **200, 400, 800 and 1600 ms**, each ±500 ms of jitter.

**Also:** the ±500 ms jitter is larger than the 200 ms base delay, so the first wait can come out negative (as low as −300 ms) and the retry fires immediately (`src/retry.js:8`).

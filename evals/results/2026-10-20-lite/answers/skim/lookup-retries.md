**5 attempts per tick**, hard-coded at `src/scheduler.js:16` (`withRetry(..., { attempts: 5 })`).

1. **Not in `config.json`.** That file only has `tickSeconds` and `formatter`, so changing the count means a code change.
2. **The library default is 3** (`src/retry.js:14`), but the scheduler overrides it with 5.
3. **It never fully gives up.** After 5 failures it only logs the error (`scheduler.js:18-21`). The reminder stays `sent = 0`, so the **next tick starts another 5 attempts**. The tick interval defaults to 30s (`scheduler.js:25`).
4. **Wait between attempts:** 4 waits of about **200, 400, 800 and 1600 ms**, each **±500 ms** of random jitter (`retry.js:4-9`). There is no wait after the last attempt.

**Also:** I didn't check whether `config.json`'s `tickSeconds` is actually passed into `startScheduler`.

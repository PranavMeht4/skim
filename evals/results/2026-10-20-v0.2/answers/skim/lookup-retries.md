**5 attempts per tick**, hardcoded at `src/scheduler.js:16`: `withRetry(() => send(r, opts), { attempts: 5 })`.

- That overrides the default of **3** in `withRetry` (`src/retry.js:14`).
- `config.json` has no setting for it. Changing it means editing `scheduler.js`.
- Waits between the 5 tries are about **200, 400, 800 and 1600 ms**, each shifted randomly by up to ±500 ms (`src/retry.js:6-9`).

**It never fully gives up.** After 5 failures it logs `reminder <id> failed: ...` and leaves the reminder unsent (`src/scheduler.js:18-21`). The next tick, **30 s** later (`tickSeconds` in `config.json`), runs another 5 tries. There is no overall limit, so a reminder that can never be sent is retried forever.

**Also:** the first wait can come out negative (200 − 500 ms). `setTimeout` treats that as 0, so the first retry can happen immediately.

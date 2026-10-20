**Create → store as UTC → 30s poll → retry → print to stdout.** Any reminder with a non-zero UTC offset fires at the wrong time.

1. **Create:** `POST /reminders` goes to `createReminder` (`api.js:43`). It requires `userId`, `text` and `at`, and `tzOffsetMin` defaults to **0** (`api.js:12`). **Nothing calls `handle()` at runtime.** `index.js` only starts the scheduler, and there is no HTTP server, so only the tests can create reminders.
2. **Convert:** `toUtcMs` turns the local `at` plus the offset into a UTC `due_ms` (`api.js:7-9`). For IST, 09:00 becomes **03:30Z**, which is correct.
3. **Store:** the row goes into an in-memory array with `sent: 0` (`db.js:37-48`).
4. **Poll:** `setInterval` runs `tick()` **every 30s** (`config.json:2`, `scheduler.js:25-27`). The first tick comes 30s after start, and delivery can lag up to 30s. Each tick reads the rows where `sent = 0` (`scheduler.js:13`).
5. **Due check (bug):** `dueReminders` subtracts the offset a **second time** (`scheduler.js:9`). An IST reminder fires **5.5h early**, and a UTC-5 reminder fires **5h late**.
6. **Send:** `withRetry` makes up to **5 attempts**, with backoff of 200/400/800/1600 ms ±500 ms (`scheduler.js:16`, `retry.js:6-10`). `send` imports the formatter named in config, which is **`legacy`** (`config.json:3`, `notify.js:8`), and writes the result to `console.log` (`notify.js:14-17`). For example: `REMIND|u1|2026-03-01T09:00|call mum`.
7. **Mark sent:** after a successful send, `UPDATE … sent = 1` runs (`scheduler.js:17`). If all 5 attempts fail, the error is logged and the reminder is tried again on the next tick, with no limit (`scheduler.js:18-21`).

**Not run:** running node needed approval, so neither the tests nor my end-to-end check ran. All timings here are worked out by reading the code.

**Also:**
- **Lost on restart:** `db.js` keeps everything in memory, but `README.md:16` says the service must survive restarts.
- **Bad `at` is accepted silently (from reading, not run):** any `at` not in `YYYY-MM-DDTHH:mm` format, even one with seconds, gives a `NaN` `due_ms`. The request still returns 201, and the reminder never fires.
- **DST:** the offset is fixed when the reminder is created, so a reminder made in winter for a summer date is off by 1h.
- **Possible double-send:** `setInterval` doesn't wait for `tick` to finish. If a tick runs past 30s, the next tick sends the same unsent rows again. This can't happen today because `console.log` doesn't fail.
- **SQL injection** in search: `userId` and `q` are concatenated into the query (`api.js:31`).
- **Delete has no ownership check**, so anyone can delete any reminder id (`api.js:35-38`).
- `format.js`, the "current" format, only runs in a test. Production uses `legacy`, which has a TODO to remove it.

**The timezone bug in numbers:**
```
at = 2026-03-01T09:00, tzOffsetMin = 330 (IST)
api.js:8        due_ms = 09:00Z − 5h30 = 03:30Z           correct
scheduler.js:9  due at   03:30Z − 5h30 = 22:00Z Feb 28    → 03:30 IST, 5.5h early
```
**Why the tests miss it:** the scheduler tests only use offset 0 (`test/scheduler.test.js:6`), the only case where subtracting twice changes nothing.

**Fix:** change `scheduler.js:9` to `r.due_ms <= nowMs` and correct the comment at `scheduler.js:7`. The API side is right: `README.md:37` defines `due_ms` as UTC, and `test/api.test.js:12` checks that offset 330 gives 03:30Z. I haven't edited anything.

**A single-process Node 20 reminder scheduler: 351 lines, no dependencies.**
1. `src/index.js:6` reads `config.json` and starts a tick **every 30s**.
2. Each tick (`src/scheduler.js:12`) loads rows with `sent = 0` and keeps the due ones. It sends each one with **up to 5 attempts**, then sets `sent = 1`.
3. `src/notify.js:14` picks a formatter by name (config says `legacy`) and writes the message to **`console.log`**. Nothing else delivers it.
4. **There is no HTTP server.** `api.handle` (`src/api.js:41`) is only called from tests, so the running service can't take in reminders.
5. **Storage is in memory** (`src/db.js`), so a restart loses everything. The README's open item is making it persist, within these limits: one process, under 5k rows, no new infrastructure.

Run it with `npm start` and test with `npm test`. **I did not run the tests**, because `node` needed approval. Everything here comes from reading the code.

**Also:** bugs to know before you change anything:
1. **Reminders fire at the wrong time outside UTC.** `api.js:16` already stores `due_ms` in UTC, and then `scheduler.js:9` subtracts the offset a second time. A 09:00 reminder in IST fires at 03:30 IST, **5.5h early**. US users get theirs late. The scheduler tests only use offset 0, so they can't catch this.
2. **Search crashes on text containing " and ".** `api.js:31` pastes the search term into the SQL string. `db.js:29` then splits on `AND` and throws `unsupported condition` (`db.js:18`).
3. **SQL injection** on that same line (`api.js:31`). It becomes exploitable once `db.js` is replaced by a real database, which the persistence work implies.
4. **Duplicate sends are possible.** `setInterval` (`scheduler.js:26`) doesn't wait for `tick` to finish. A failing send burns about 3s of backoff, so about 10 failures push a tick past 30s. The next tick then re-sends rows the first one hasn't marked yet.
5. **No auth.** `userId` comes from the request, and `DELETE /reminders/:id` (`api.js:35`) deletes anyone's reminder.
6. **Production uses the legacy format** (`config.json:3`, and the default at `notify.js:14`). The TODO at `legacy.js:2` says to remove that file. Removing it breaks delivery unless config first switches to `format`.
7. Smaller issues:
   - Fixed offsets ignore DST.
   - A missing `tzOffsetMin` silently means UTC (`api.js:12`).
   - An invalid `at` gives a `NaN` due time, so the reminder never fires.
   - A failed reminder is retried every tick, forever.

**Files**

| File | Role | Watch out |
|---|---|---|
| `api.js` | 4 routes, plain `{method,path,query,body}` in, `{status,body}` out | not wired to any server |
| `db.js` | fake SQL over an array | parses only the exact statements the service uses |
| `scheduler.js` | finds due reminders, sends them, marks them sent | double offset (bug 1) |
| `retry.js` | exponential backoff, 200ms base, ±500ms jitter | — |
| `notify.js` | loads `./<name>.js` dynamically, calls its `default` | name comes from config |
| `format.js` / `legacy.js` | message text: sentence vs `REMIND\|user\|at\|text` | — |

**Routes** (`api.js:41-48`):
- `POST /reminders` with body `{userId, text, at, tzOffsetMin}`
- `GET /reminders?userId=`
- `GET /reminders/search?userId=&q=`
- `DELETE /reminders/:id`

**Data model:** each row has `id, user_id, text, at, tz_offset_min, due_ms, sent`.
- `at` is the user's local wall-clock time.
- `due_ms` is the same moment as a UTC epoch in milliseconds (`README.md:31-37`).

**`db.js` limits:**
- It understands only `INSERT`, `SELECT *`, `UPDATE ... SET sent = 1` and `DELETE`, with `col = ?` or `LIKE` conditions joined by `AND`.
- A new query shape needs new parsing code in `db.js:37-66`.
- `queryLog` (`db.js:8`) records every statement, so tests can inspect them.

**Tests:** 11 tests in 4 files, using `node:test`. These have no tests:
- `tick` and `startScheduler`
- search
- a non-zero timezone offset in the scheduler
- the `legacy` formatter

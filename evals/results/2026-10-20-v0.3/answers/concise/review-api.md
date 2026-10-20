Two problems are serious: an SQL injection in search, and reminders firing at the wrong time for anyone outside UTC. I found these by reading the code. I tried a quick script to confirm them, but it was blocked waiting for approval.

1. **SQL injection in `searchReminders`** (`src/api.js:31`). `userId` and `q` are pasted straight into the SQL. With a real database, `userId=' OR '1'='1` returns every user's reminders, and a normal search like `mum's` causes a syntax error. Pass them as parameters instead: `query('... WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q}%`])`. The in-memory db already supports `LIKE ?`.

2. **Time zone offset applied twice.** `toUtcMs` (`src/api.js:8`) correctly stores `due_ms` as UTC, as the README says. But `dueReminders` (`src/scheduler.js:9`) subtracts `tz_offset_min` again. So an IST (+330) reminder fires 5.5h early, and a US Eastern (−300) reminder fires 5h late. Every test uses offset 0, so none of them catch it. The fix belongs in the scheduler: `r.due_ms <= nowMs`, and delete the outdated comment above it.

3. **Bad `at` values are saved silently and never fire.** Nothing checks that `at` parses. A common ISO form with seconds, like `2026-03-01T09:00:00`, becomes `...09:00:00:00Z`, which parses as `NaN`. The API still returns 201, and `NaN <= now` is never true, so the reminder never sends. A non-numeric `tzOffsetMin` breaks it the same way. Return 400 when `!Number.isFinite(dueMs)`.

4. **No ownership checks.** `deleteReminder` (`:35-38`) deletes any id without checking whose it is. List and search trust whatever `userId` the client sends. Unless something before `handle` authenticates the user, anyone can read or delete anyone's reminders. Even with auth upstream, delete should add `AND user_id = ?`.

5. **Missing query parameters.** `GET /reminders` with no query string crashes with a TypeError, because `req.query` is undefined (`:25`, `:31`). Search with no `q` looks for the literal text `"undefined"`. Both should return 400.

A smaller design issue: storing one fixed offset per reminder means a reminder set across a daylight-saving change fires an hour off. That only matters if you have US or EU users.

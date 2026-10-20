**3 real problems in api.js. The worst bug is in scheduler.js.**
- ⛔ **SQL injection:** search pastes `userId` and `q` straight into SQL (`src/api.js:31`)
- ⚠ **Silent bad input:** a NaN due time still gets 201 and never fires (`src/api.js:16`)
- ⚠ **No ownership:** any caller can list or delete any user's reminders (`src/api.js:37`)
- **Also:** the scheduler applies the offset twice, so IST fires 5h30m early (`src/scheduler.js:9`)

───

**1. SQL injection.** Line 31 builds the search SQL by joining strings.
- **Already breaks:** the stub splits WHERE on ` AND `. A search for "bread and milk" throws `unsupported condition: text LIKE '%bread`, and `handle` doesn't catch it.
- **After the DB move:** the README requires persistence (README:16), so a real DB is coming. Then `q = "' OR 1=1 --"` returns every user's reminders.
- **Fix:** the stub already supports `LIKE ?` (`db.js:20`).
  ```js
  query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q}%`]);
  ```

**2. Silent bad input.** Nothing checks the format of `at` or the type of `tzOffsetMin`.
- `tzOffsetMin: "+05:30"` → `"+05:30" * 60_000` is NaN → stored as `due_ms` → 201 → `NaN <= now` is false forever. The user gets no reminder and no error.
- `tzOffsetMin: null` silently means UTC. The `= 0` default only covers `undefined`.
- A bad `at` has the same risk. I didn't check which strings V8 rejects and which it misparses.
- **Fix:** return 400 unless `at` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`, `tzOffsetMin` is an integer from −720 to 840, and `Number.isFinite(dueMs)`.

**3. No ownership.** The request shape `{ method, path, query, body }` carries no identity.
- List and search trust whatever `userId` the query string sends. Delete goes by id alone.
- **Not exposed yet:** only the tests call `handle`, and `index.js` starts only the scheduler. This becomes real as soon as an HTTP layer exists.
- **Fix:** take the user from auth, and use `DELETE ... WHERE id = ? AND user_id = ?`.

**4. Scheduler double offset (outside api.js).** README:37 says `due_ms` is already UTC, and `toUtcMs` gets this right. `scheduler.js:9` subtracts `tz_offset_min` a second time. Its comment at line 7 contradicts the README.
- IST (330) fires 5h30m early. New York (−300) fires 5h late.
- **Why tests miss it:** every test uses offset 0 (`test/api.test.js:17`, `test/scheduler.test.js:6`).
- **Fix:** `r.due_ms <= nowMs`, plus a test with offset 330.

**Smaller issues**
- **Return values tied to the stub:** the stub's INSERT returns `[row]` and its DELETE returns a count (`db.js:48`, `db.js:64`). A real driver returns a result object. `removed ?` would then always be true, so DELETE would always answer 204, and the 201 body from create wouldn't be the stored row.
- **Crash with no query:** `GET /reminders` without a `query` object throws a TypeError at `q.userId` (`api.js:25`). A missing `userId` returns `[]` instead of 400.
- **DST:** each reminder stores one fixed offset. If a New York user books in February for April and the client sends February's offset, the reminder fires 1h late. That comes from the README's design, not a bug in the code. IST has no DST. Storing an IANA time zone would fix it.
- **Delete path:** `startsWith('/reminders/')` plus `pop()` means `/reminders/x/1` deletes id 1. Harmless today.

**Not run:** I only read the code. `node --test` needed approval and didn't run, so I have no test results.

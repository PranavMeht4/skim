**3 real problems in `api.js`; the worst bug, though, is in how `scheduler.js` reads what `api.js` stores.** I couldn't run anything (the command was denied), so all of this comes from **reading the code** and none of it is executed.

1. **SQL injection in search** (`api.js:31`): `userId` and `q` are pasted straight into the SQL string.
   - **Today:** a search containing " and " (e.g. `"milk and eggs"`) **would throw**, uncaught. `db.js:29` splits the SQL on `AND`, which leaves an unsupported condition (`text LIKE '%milk`). **No rows leak today**: the stand-in compares `x' OR '1'='1` as a plain `user_id`.
   - **Once `db.js` becomes a real DB** (the README needs this so data survives restarts): it's classic injection. Even an innocent `"mum's"` breaks the query.
   - **Fix:** `query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, \`%${q.q}%\`])`.
2. **Bad `at` or `tzOffsetMin` is accepted** (`api.js:13-16`): only presence is checked.
   - `at: 'tomorrow'` or `tzOffsetMin: 'abc'` → `due_ms = NaN` → **201 Created**.
   - The scheduler's `NaN <= now` is always false, so the reminder **never fires, and nothing reports an error**.
   - **Fix:** match `at` against `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`, require an integer offset between -720 and 840, and return 400 unless `Number.isFinite(dueMs)`.
3. **The API trusts whatever identity the caller sends** (`api.js:25, 31, 35-38`):
   - list and search take any `userId` from the query string.
   - delete takes **only an id**, and ids are **sequential** (`db.js:39`), so a simple loop deletes everything.
   - This matters **only if no auth layer** sits in front. Adding `AND user_id = ?` to delete makes it consistent with the others, but it **isn't real security**.

**Also:**
- **Timezone is applied twice:** `api.js` stores `due_ms` already in UTC, which matches the README. `scheduler.js:9` then subtracts `tz_offset_min` again.
  - IST (+330) reminders fire **5.5h early**; US Eastern (-300) fires **5h late**.
  - **Fix `scheduler.js:9` to `r.due_ms <= nowMs`.** **Don't touch `toUtcMs`**: it's correct, and `api.test.js:12-13` pins it.
  - Tests miss it because the scheduler test and the create test both use **only offset 0**.
- **There's no search test at all**, which is why the " and " crash went unnoticed.
- `index.js` **never imports `api.js`** and there's no HTTP server, so none of the API is reachable yet.

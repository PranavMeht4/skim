**3 real problems. The worst is in `scheduler.js`, not `api.js`.**
1. **The UTC offset is applied twice**, so reminders fire **5.5h early** for IST and late for negative offsets. `api.js:16` stores UTC correctly. Then `scheduler.js:9` subtracts the offset again.
2. **SQL injection in search** (`api.js:31`). With today's in-memory stub, an ordinary search like "milk and eggs" crashes it. With a real database, it's exploitable.
3. **Bad input saves without error:** `at: "tomorrow"` returns 201, stores `due_ms: NaN`, and never fires (`api.js:13-16`).

**Not verified:** I didn't run the tests because the command needed approval. All findings come from reading the code.

**1. Double offset.** `README.md:37` and `toUtcMs` both say `due_ms` is UTC, and `api.test.js:12-13` tests for that. But `dueReminders` runs `r.due_ms - r.tz_offset_min * 60_000 <= nowMs`, and its comment (`scheduler.js:7`) wrongly calls `due_ms` wall-clock time.
```
at 09:00, offset 330 (IST)
api.js     due_ms = 09:00Z - 5h30 = 03:30Z   correct (09:00 IST)
scheduler  03:30Z - 5h30 = 22:00Z prev day   fires at 03:30 IST
```
Fix: change `scheduler.js:9` to `!r.sent && r.due_ms <= nowMs` and fix the comment. Don't change `toUtcMs`, or the api tests will fail. The tests missed this because every scheduler test uses `tz_offset_min: 0` and none goes from create to tick.

**2. SQL injection.** `userId` and `q` are pasted straight into the SQL string.
- **Stub today:** the stub splits conditions on `AND`, so "milk and eggs" throws `unsupported condition: text LIKE '%milk`. If `q` is missing, it searches for the literal text "undefined".
- **Real database** (the README says the data must survive restarts): `q=' OR '1'='1` returns every user's reminders.

Fix (the stub already supports `LIKE ?`):
```js
query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q ?? ''}%`]);
```

**3. NaN `due_ms`.** Only presence is checked. `Date.parse("tomorrow:00Z")` gives NaN, and `NaN <= now` is always false, so the reminder stays unsent forever and nothing is logged. A non-numeric `tzOffsetMin` does the same. Fix: match `at` against `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`, require `Number.isFinite(dueMs)` and an integer `tzOffsetMin`, and return 400 otherwise.

**Only matters if untrusted clients can reach it: no ownership checks.** The caller supplies `userId`, and DELETE removes any id it's given (`api.js:36-37`).

**Also:** nothing serves `handle()` yet, because `index.js` only starts the scheduler. A missing `req.query` makes list and search throw a TypeError (`api.js:25`). A missing `tzOffsetMin` silently defaults to UTC (`api.js:12`). A fixed offset will be 1h off across DST changes.

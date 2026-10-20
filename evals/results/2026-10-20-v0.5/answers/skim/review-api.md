**4 real problems. The worst is a timezone bug caused by `scheduler.js`, not `api.js`.**
1. **Reminders fire at the wrong time** for every non-UTC user. `toUtcMs` (`api.js:7`) already returns UTC, then `scheduler.js:9` subtracts the offset again. IST reminders fire **5h30 early**; New York ones fire **5h late**. Fix it in `scheduler.js:9`; **don't change `api.js`**.
2. **Search breaks on ordinary text** (`api.js:31`). Values are pasted into the SQL, and `db.js:29` splits on ` AND `. So `q=milk and bread` throws `unsupported condition: text LIKE '%milk`. It also becomes **SQL injection** once `db.js` is swapped for a real database.
3. **Bad input gets a 201 but never fires** (`api.js:13-16`). `at: 'tomorrow'` or `tzOffsetMin: 'abc'` stores `due_ms` as `NaN`, and `NaN <= now` is never true.
4. **No ownership check on delete** (`api.js:35-38`). Ids count up from 1, so any caller can delete anyone's reminder. List and search also trust the `userId` the client sends. Nothing serves `handle()` yet (`index.js` only starts the scheduler), so this is **latent**.

**Not executed:** the command to run the tests and probes needed approval, so everything here comes from tracing the code.

### Details and fixes

**1. Double timezone shift.** The README table and `api.test.js:12-13` agree that `due_ms` is already UTC. The comment at `scheduler.js:7` is wrong. The tests pass only because `scheduler.test.js` always uses `tz_offset_min: 0`.
```js
// scheduler.js:9
return reminders.filter((r) => !r.sent && r.due_ms <= nowMs);
```
Add a scheduler test with offset `330` so this can't come back.

**2. Search.** Use parameters, which also fixes the ` AND ` split:
```js
const sql = 'SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?';
return { status: 200, body: query(sql, [q.userId, `%${q.q ?? ''}%`]) };
```

**3. Validation.** Return 400 unless `at` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$` and `Number.isFinite(dueMs)`.
- An `at` with seconds (`2026-03-01T09:00:00`) likely becomes `NaN` too, because the code appends `:00Z` again. I didn't run it.
- A missing `tzOffsetMin` silently defaults to **UTC** (`api.js:12`), so a client that leaves it out gets the wrong time. Consider making it required.

**Also:**
- `GET /reminders` or `/reminders/search` with no `query` throws `TypeError` (`api.js:25`, `:31`), and `handle()` has no try/catch.
- List without a `userId` returns `200 []` instead of 400. Search without `q` searches for the literal text `"undefined"`.
- A fixed offset is wrong across **DST**: a reminder set in winter for a summer date fires 1h off. This is a design limit and low priority; storing an IANA zone fixes it.
- Rows are lost on restart, but that's `db.js` and the README already notes it.

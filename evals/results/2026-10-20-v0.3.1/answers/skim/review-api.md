**5 problems in `api.js`**; the worst bug is in `scheduler.js` (see Also).
1. **SQL injection** in search: `userId` and `q` are pasted straight into the SQL (`api.js:31`). Searching "bread and butter" already crashes.
2. **No caller identity:** every route trusts a `userId` the client sends. DELETE matches on `id` alone, so anyone can delete any reminder (`api.js:37`).
3. **A bad `at` is accepted silently:** `at: 'tomorrow'` stores `due_ms: NaN` and returns 201, and the reminder never fires (`api.js:13-16`).
4. **Crashes instead of 4xx:** a missing `req.query` throws a TypeError (`api.js:25`, `:31`). `handle` has no try/catch.
5. **DST drift:** one fixed `tzOffsetMin` is wrong for reminders that cross a DST change. This is a design issue and the lowest priority.

**Also:**
- **Reminders fire at the wrong time for every non-UTC user.** `api.js` already stores `due_ms` as UTC, and `scheduler.js:9` subtracts the offset a second time. IST reminders fire **5.5h early** and New York ones **5h late**. Fix: `r.due_ms <= nowMs`. The tests miss it because `scheduler.test.js:6` hardcodes `tz_offset_min: 0`.
- **`handle` isn't wired up:** `index.js` only starts the scheduler, and only the tests call `handle`.

**Not run:** permissions blocked my probe scripts. Every finding comes from reading and tracing the code, not from running it.

**1. SQL injection (`api.js:29-33`).** On a real SQL database, `userId=' OR '1'='1` returns every user's reminders. The in-memory stand-in breaks ordinary searches too:
- `db.js:29` splits the WHERE clause on ` AND `.
- So "bread and butter" leaves the fragment `text LIKE '%bread`.
- `db.js:18` then throws `unsupported condition: text LIKE '%bread`. I traced this; I didn't run it.
- A missing `q` searches for the literal text "undefined".

This fix works with today's `db.js`, because `db.js:17` accepts `LIKE ?`:
```js
query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q ?? ''}%`])
```

**2. No caller identity (`api.js:24-38`).** The request shape `{ method, path, query, body }` carries no session or user. So list and search show any user's reminders to whoever names that `userId`. DELETE doesn't ask for a user at all. Fix:
- take the user from auth, not from the query or body
- delete with `WHERE id = ? AND user_id = ?` (`db.js` supports this)

**3. No input validation (`api.js:13-16`).** The code only checks that fields are present.
- `'tomorrow'` becomes `Date.parse('tomorrow:00Z')`, which is NaN.
- `NaN <= now` is always false, so the reminder never fires, but the user got a 201.
- The 201 response shows `due_ms: null`, because JSON turns NaN into null.

Fix, returning 400 on any failure:
- `at` must match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/` (the README's format)
- `Number.isFinite(dueMs)` must be true
- `tzOffsetMin` must be an integer in [-720, 840]

**4. Crashes.** `listReminders` and `searchReminders` read `req.query` with no default. Any error from the database also escapes `handle`, so the caller crashes instead of getting a 500.

**5. DST.** Say a New York user sets a July 09:00 reminder in January. The client sends offset -300, so the reminder fires at 10:00 EDT. Fix: store an IANA zone such as `America/New_York` and work out the offset for the target date with `Intl`. Node 20 has this built in, so it needs no new packages.

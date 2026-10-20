**`api.js` has 5 real problems. 2 are security holes.**
1. **SQL injection** in search: user input is pasted straight into the SQL string (`api.js:31`).
2. **Delete has no owner check:** any caller can delete any reminder by id (`api.js:37`).
3. **Bad input makes a reminder that never fires:** an invalid `at` or `tzOffsetMin` stores `due_ms: NaN` and still returns 201 (`api.js:13-16`).
4. **A request with no `query` crashes** list and search with a TypeError (`api.js:25`, `:31`).
5. **One fixed offset breaks across DST:** a reminder dated after a DST switch fires 1 hour off (`api.js:12`).

**Also:**
- **`scheduler.js:9` subtracts the offset a second time.** IST reminders fire **5h30m early** and New York ones 5h late. It isn't in `api.js`, but it's the worst bug I found. Fix: `r.due_ms <= nowMs`. The tests miss it because `scheduler.test.js:6` only uses offset 0.
- Nothing calls `handle` except the tests. `index.js` only starts the scheduler.
- **I couldn't run anything.** `node` and writing a probe script were both blocked by permissions. Every finding comes from reading `api.js`, `db.js`, `scheduler.js` and the README.

**1. SQL injection.** With a real SQL database, `q = "' OR 1=1 --"` returns every user's reminders. The README says `db.js` must become persistent, so this goes live when it is swapped out. Even the in-memory `db.js` breaks today: `q = "milk and eggs"` gets split at `AND` (`db.js:29`) and throws `unsupported condition: text LIKE '%milk`. I traced that by hand and didn't execute it. Fix (`db.js` already accepts `?` with `LIKE`):
```js
query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q}%`])
```

**2. Delete.** Ids count up from 1 (`db.js:39`), so looping `DELETE /reminders/1…5000` wipes everyone's reminders. Fix: require `userId` and use `WHERE id = ? AND user_id = ?`. Every route also trusts a `userId` sent by the client, so list and search expose anyone's reminders too. That's only safe if a layer above sets `userId` from a login session, and I found no such layer.

**3. Reminders that never fire.** A sure case is `tzOffsetMin: "abc"`, because `"abc" * 60_000` is NaN. `toUtcMs` also blindly appends `:00Z`, so `"2026-03-01T09:00:00"` becomes `…09:00:00:00Z`. The scheduler checks `NaN <= nowMs`, which is false, so the reminder is never sent and nothing is logged. Fix: return 400 unless `at` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$`, `tzOffsetMin` is an integer from -720 to 840, and `Number.isFinite(dueMs)`.

**4. Missing query.** `handle({ method: 'GET', path: '/reminders' })` throws `Cannot read properties of undefined (reading 'userId')`. With no `userId`, list quietly returns `[]` and search looks up the user `'undefined'`. Fix: default to `query: q = {}` and return 400 when `userId` is missing.

**5. DST.** Say a New York user creates a reminder in February (offset −300) for 09:00 on 2026-04-01. NY is on EDT (−240) by then, so it fires at 10:00 local. The current code is only right if the client sends the offset for the reminder's date, not for today. IST has no DST, so this only affects users in DST zones. Fix: accept an IANA zone such as `America/New_York` and work out the offset for that date.

**Checked and fine:** the sign in `toUtcMs` matches the README and `api.test.js:11-13`. `removed ? 204 : 404` works because `db.js` returns a count.

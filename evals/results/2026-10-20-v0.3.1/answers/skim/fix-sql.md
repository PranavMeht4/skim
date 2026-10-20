**✓ Search injection fixed. 13/13 tests pass** (`node --test test/`).

- `src/api.js:30`: the search now uses placeholders, `user_id = ? AND text LIKE ?`, with `[q.userId, `%${q.q}%`]` as params. No user input goes into the SQL string any more.
- `test/api.test.js`: 2 new tests. **Both failed on the old code**, then passed after the fix:
  1. **Injection test:** a hostile `userId` and `q` (quotes, `OR 1=1`, `--`) must not appear in the logged SQL, only in `params`. Old failure: `SELECT * FROM reminders WHERE user_id = 'u1' OR '1'='1' AND text LIKE '%x%' OR 1=1 --%'`
  2. **Behavior test:** searching "milk and eggs" returns only u1's match. The old code crashed with `unsupported condition: text LIKE '%milk`.
- **Before the change: 11/11 passed.** Nothing else broke.
- I checked `src/` for other SQL built by joining strings. **None found.**

**Also:**
- **There is no auth on these routes.** `userId` comes straight from the query string, so any caller can read any user's reminders, injection or not.
- A `%` or `_` typed into the search still acts as a LIKE wildcard in real SQL. I didn't fix that, because the in-memory `db.js` doesn't support `ESCAPE`.
- If `q` is missing, the search still looks for the literal text "undefined". The old code did the same.

**✓ Fixed: the search endpoint now uses bound parameters. 13/13 tests pass.**
- `src/api.js:29-34`: the query is now `SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?`, with `[q.userId, `%${q.q}%`]` passed as parameters. The `%` wildcards are added to the value, so nothing the user sends ends up in the SQL text.
- `test/api.test.js`: 2 new tests.
  - **Behaviour:** search finds text matches and returns only that user's reminders.
  - **Injection:** sends `userId = "u1' --"` and `q = "x' OR '1'='1"`, then checks `queryLog` to confirm the SQL string never changes and the input arrives only in `params`.

**Verified:** I put the old concatenation back and ran the tests. The injection test **failed** (6 pass, 1 fail). With the fix restored, `node --test test/` passes **13/13**.

**Also:**
- No other query in `src/` builds SQL from strings. I checked with a case-insensitive grep.
- `%` and `_` typed into `q` still work as LIKE wildcards. This is not an injection risk, because the search stays limited to that `user_id`. I left it as is, because the in-memory `db.js` can't handle the `ESCAPE` clause that would fix it.

**Fixed: the search endpoint now uses bound parameters. `node --test test/` passes 12 of 12.**

1. **Fix** (`src/api.js:30`): the query is now a fixed string, `SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?`, with `[q.userId, '%' + q.q + '%']` passed as parameters. No user input reaches the SQL text.
2. **New test** (`test/api.test.js:35`, "search passes user input as parameters, not as SQL"):
   - It checks the logged SQL is that fixed string and the params are `['u1', '%milk and eggs%']`.
   - It searches for `milk and eggs` and checks that only `u1`'s row comes back, not `u2`'s.
3. **The test fails on the old code:** `unsupported condition: text LIKE '%milk`. The ` and ` in the search text split the concatenated SQL apart, which shows that input was being read as SQL.
4. **Results:** 11 of 11 passed before the change, and **12 of 12 pass after**, with 0 failures.

**Also (not changed):**
- **`%` and `_` in a search term still act as LIKE wildcards.** Escaping them needs an `ESCAPE` clause, which the in-memory `db.js` can't parse.
- **A request with no `q` still searches for `%undefined%`**, same as before. Defaulting it to empty would change behavior, so I left it.
- `api.js:31` was the **only** SQL built by string concatenation in `src/`.

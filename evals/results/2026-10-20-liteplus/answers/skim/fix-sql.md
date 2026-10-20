**Fixed: the search query now uses `?` placeholders. `node --test test/` passes 13 of 13 (it was 11).**
1. **Fix** is in `src/api.js:29`. It runs `SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?` with params `[q.userId, `%${q.q}%`]`. The `%` wildcards go in the param, so user input never becomes part of the SQL text.
2. **Test 1** in `test/api.test.js`, "search passes user input as parameters, not as SQL": it reads the last `queryLog` entry and checks the exact SQL and the params.
3. **Test 2**, "search treats SQL keywords in the term as text and stays within the user": it searches `bread and milk` and expects only u1's matching reminder back.
4. **Both new tests failed on the old code**: test 1 with `AssertionError`, test 2 with `unsupported condition: text LIKE '%bread`.
5. **A user-facing bug is fixed too:** before, **any search term containing " and "** made the search throw, because the stand-in database read it as SQL.

**Caveats:**
- **I didn't reproduce a real cross-user data leak.** The in-memory stand-in in `src/db.js` doesn't understand `OR`. Test 1 shows the input is passed as parameters, not that an attack failed.
- **`%` and `_` in a search term still work as wildcards.** That isn't injection. Treating them as plain characters needs an `ESCAPE` clause, which the stand-in can't handle, so I left `db.js` unchanged.
- **A missing `q` still searches for `%undefined%`**, the same as before.
- **Nothing is committed**: this folder isn't a git repo.

**Also:** the search was the **only** query built by joining strings. The other queries in `api.js` and `scheduler.js` already use `?` placeholders or take no user input.

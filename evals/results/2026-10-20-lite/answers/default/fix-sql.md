I fixed the search endpoint: user input is now passed to the database as parameters instead of being pasted into the SQL. `node --test test/` passes all 13 tests.

**The fix** (`src/api.js:29`): the query is now `SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?`, with `[q.userId, `%${q.q}%`]` passed separately. No other query in `src/` builds SQL from user input.

**Two new tests** in `test/api.test.js`:
- **Search scoping:** search finds matching reminders (ignoring case) and returns only that user's.
- **Injection:** a search term of `' AND text LIKE '` returns nothing. Under the old code it closed the quote and matched every one of that user's reminders. The test also checks that no user input appears in the SQL text and that both values are passed as parameters.

I ran the tests against a scratch copy with the old query restored, and the injection test failed there, so it does catch the bug.

**Still open:** `%` and `_` in a search term still act as `LIKE` wildcards, so searching for `%` returns all of that user's reminders. That isn't injection, because the term can't break out of its parameter or reach other users' rows. Making them literal would need an `ESCAPE` clause, which the in-memory DB in `src/db.js` can't handle yet.

I couldn't delete the scratch script at `/tmp/rs-check/run-old.mjs` because it's outside this project and `rm` needed your approval. You can remove it yourself.

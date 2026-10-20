**✓ Search SQL now uses parameters. 13/13 tests pass.**
- **Fix:** the search uses `user_id = ? AND text LIKE ?` with params; no input goes into the SQL text (`src/api.js:30`)
- **Test:** 2 new tests. Both failed on the old code and pass now (`test/api.test.js:41`)
- **Other queries:** no other query in `src/` builds SQL from strings
- **Also:** `%` and `_` in a search term still act as LIKE wildcards. It's not a leak: they only match more of that same user's reminders.

───

```
src/api.js          +4 −2   parameterized search query
test/api.test.js   +22 −1   search behaviour + query-log tests
```

**Before the fix, the new tests failed with:**
```
not ok 5 - search returns only that user's matches, even when the term has SQL in it
  error: "unsupported condition: text LIKE '%bread"
not ok 6 - search passes user input as params, never in the SQL text
  error: "input leaked into SQL: SELECT * FROM reminders WHERE user_id = 'u1' OR '1'='1' AND text LIKE '%x' OR '1'='1%'"
```

The first failure was a real bug as well as a security hole. Any search term containing the word "and" crashed the endpoint.

**What the tests check:**
- **Behaviour:** a search for `bread and milk` as `u1` returns only `u1`'s matching reminder. It skips `u2`'s identical one.
- **Query log:** for the payload `' OR '1'='1`, the logged SQL contains neither input, and the params carry both.

**Left as before:**
- **Missing inputs:** a missing `userId` or `q` still behaves as it did before; I added no 400 checks.
- **Wildcards:** escaping them would need an `ESCAPE` clause, which the in-memory `db.js` can't parse.

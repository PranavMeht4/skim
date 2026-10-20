**✓ Search SQL injection fixed. 13/13 tests pass** (`node --test test/`).

- `src/api.js:29`: `searchReminders` now uses placeholders, `user_id = ? AND text LIKE ?`. `userId` and `` `%${q.q}%` `` are passed as parameters, the same way the other endpoints already do it.
- `test/api.test.js`: **2 new tests**
  1. Search returns only the matching user's rows, and a search text with a quote (`mum's`) still works.
  2. An injection payload (`u1' OR '1'='1`) stays out of the SQL text and is passed only as a parameter, checked through `queryLog`.

**Verified:** I briefly put the old concatenated code back. Test 6 failed against it (`not ok 6`), then passed again once the fix was restored. This was the only place in `src/` that built SQL by concatenation.

**Also:** two things I left alone. If `q` is missing, the search pattern becomes `%undefined%`, and it already did that before this change. A user can also type `%` in the search to match all their own reminders. That is wildcard matching, not injection: results stay limited to that user's rows.

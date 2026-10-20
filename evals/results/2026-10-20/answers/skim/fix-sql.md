**✓ Fixed the SQL injection in search. `node --test test/` now passes 14/14** (it was 11/11 before, and I added 3 tests).

**Cause:** `searchReminders` pasted `q.userId` and `q.q` straight into the SQL string at `src/api.js:31`.
**Fix:** it now uses bound parameters:
```js
query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q}%`])
```
**Proof:** I ran the new tests against the old code first, and 2 of them failed:
```
not ok 6 - search treats SQL keywords in the search text as plain text
  error: "unsupported condition: text LIKE '%milk"
not ok 7 - search passes user input as bound parameters, never in the SQL
```
After the fix, all 14 tests pass.

| File | Change |
|---|---|
| `src/api.js:29-35` | Search query now uses `?` placeholders |
| `test/api.test.js` | 3 new tests: search filters by user and text; the word "and" in the search text no longer breaks the query; user input goes into `params` and never into the SQL string (checked via `queryLog`) |

`scheduler.js` and the other handlers in `api.js` already used static SQL or `?` placeholders, so nothing else needed changing.

⚠ **Risk:**
- **`%` and `_` in a search term** still act as LIKE wildcards. This can't inject SQL, but a search for `%` matches all of that user's reminders. I didn't add `ESCAPE` because the fake db's parser in `src/db.js:17` rejects it.
- **A missing `q`** still searches for the literal text `%undefined%`. That was already true before this change, and I left it alone.

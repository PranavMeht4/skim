**The search endpoint now uses a parameterized query, and all 13 tests pass** (`node --test test/`: 13 pass, 0 fail).

1. **Fix:** `src/api.js:29` now runs `SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?` and passes `[q.userId, `%${q.q}%`]` as parameters. No user input goes into the SQL string anymore.
2. **Two tests added** in `test/api.test.js`:
   - `:36`: search returns only that user's reminders whose text matches, ignoring case.
   - `:45`: **injection test.** Malicious `userId` and `q` values return `[]`. It also checks that the SQL sent to `db.js` is the fixed template, with the values in `params`.
3. **I ran the injection test against the old code first, and it failed** as it should. The SQL it caught:
   ```
   actual: "SELECT * FROM reminders WHERE user_id = 'u1' OR '1'='1' AND text LIKE '%%' AND user_id LIKE '%%'"
   ```

That was the **only string-built query**. The other queries, in `api.js` and `scheduler.js`, already used fixed SQL with `?` placeholders.

**Also** (not fixed, outside what you asked):
- **`%` and `_` typed into a search still act as LIKE wildcards.** This doesn't allow injection, but searching for `%` matches everything. Fixing it needs an `ESCAPE` clause, which the in-memory `db.js` doesn't support.
- **A missing `q` or `userId` isn't checked.** With no `q`, the search looks for `%undefined%`, as the old code did.
- The folder isn't a git repo, so **nothing was committed**.

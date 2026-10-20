**4 real problems; #1–3 block launch. I couldn't run anything, so this is a static review only:** both the probe script and `node --test` needed permission and were declined.

1. **Reminders fire at the wrong time.** `api.js:16` stores `due_ms` as UTC, which matches the README. Then `scheduler.js:9` subtracts `tz_offset_min` again. An IST 09:00 reminder fires **5.5h early** (03:30 IST), and a New York 09:00 reminder fires **5h late**. **Fix it in `scheduler.js:9`** with `r.due_ms <= nowMs`, and delete the wrong comment at `scheduler.js:7`. Don't change `api.js`. **Blocks launch.**
2. **SQL injection** in search (`api.js:31`): `userId` and `q` are concatenated straight into the SQL. Today the fake `db.js` throws `unsupported condition` on a payload like `' OR '1'='1`, so it **doesn't leak yet**. It becomes exploitable as soon as `db.js` is replaced, which the README's "must survive restarts" requires. **Fix:** `user_id = ? AND text LIKE ?` with `[userId, `%${q}%`]`. **Blocks launch.**
3. **Delete has no owner check** (`api.js:35-38`): anyone can delete any reminder by id, and ids are **sequential** (`nextId++`), so they're easy to guess. **Fix:** require `userId` and add `AND user_id = ?`. **Blocks launch.**
4. **No input validation.** Bad requests get a 201, a 200 or a thrown error instead of a 400. Details below.

**Details on #4:**
- **`at` isn't checked** (`api.js:13-16`). `at: "tomorrow"` gives `due_ms = NaN`, the API still returns **201**, and the reminder **never fires**. `tzOffsetMin: "+05:30"` gives NaN the same way. **Fix:** after computing `dueMs`, return 400 if `!Number.isFinite(dueMs)`. Check that `tzOffsetMin` is an integer in a sane range.
- **A request with no `query` object crashes**: `q.userId` throws a TypeError (`api.js:25`, `:31`). `handle()` has no try/catch, so the error reaches the caller.
- **A missing `userId` or `q` fails silently.** List returns `200 []`. Search runs `LIKE '%undefined%'`. Both should return 400.

**On #1:** every test uses offset `0` (`api.test.js`, `scheduler.test.js:6`), so the suite **can't catch** it. Add a test with offset 330 and one with -300.

**On #2:** the parameterized query also fixes a fake-DB crash. `db.js:29` splits the SQL on `AND`, ignoring case, so searching for `"milk and eggs"` currently throws.

**Also:**
- **List and search trust the `userId` the client sends**, so any caller can read anyone's reminders. This matters only if nothing in front of the API authenticates users, and I couldn't tell from the repo.
- **`handle()` isn't served by anything in this repo.** `index.js` only starts the scheduler. A server may exist elsewhere.
- **DST:** the client sends one fixed offset. If it sends its current offset rather than the one in effect on the date in `at`, reminders on the other side of a DST change fire **1h off**.
- **Not a problem:** the `toUtcMs` math (`api.js:8`) is correct per the README.

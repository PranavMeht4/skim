**Pick: Node's built-in SQLite (`node:sqlite`), one file on disk, after upgrading to Node 24 LTS.**
- It fits every rule in the README: **no server, no npm dependency**, real transactions, and one process is enough.
- `src/db.js` already stands in for SQL, so the change stays inside `db.js` plus 2 statements in `api.js`.
- **Cost:** it needs **Node ≥22.13**, where it no longer needs a flag. This machine runs **v20.19.0**, and I couldn't check the VM.
- Node 20 reached **end-of-life on 2026-04-30**, so the upgrade is due anyway. That counts as the "strong reason" the README asks for.
- **First step:** parameterize the search query (`api.js:30-31`). Real SQLite would run `q=%' OR 1=1 --` and return **every user's reminders**.
- **Fallback** if the VM must stay on Node 20: an atomic JSON snapshot (write a temp file, fsync, rename).

| Option | Fits README? | Work | Verdict |
|---|---|---|---|
| **`node:sqlite` file** | Yes, on Node ≥22.13 | Rewrite `db.js` | **Pick** |
| JSON snapshot | Yes, works on Node 20 | Load at boot, save after each change | Fallback |
| Append-only JSONL log | Yes | Replay plus compaction | Overkill at 5k rows |
| `better-sqlite3` | No, native npm dep | Small | Breaks the no-deps rule |
| Postgres / Redis | No, new server | Ops plus migration | Ruled out |

**Why SQLite beats the JSON snapshot**
- Each write is a small transaction. The snapshot rewrites the whole file (**~1 MB at 5,000 rows**) on every change.
- The hand-written SQL parser (`db.js:16-31`) goes away instead of staying for good.
- **Downside:** `node:sqlite` has been "release candidate" only **since v25.7.0**. Older lines label it experimental. The service uses only `DatabaseSync`, `prepare`, `run` and `all`, so pin the Node version and run the tests on each upgrade.

**Migration steps**
1. Search: use `user_id = ? AND text LIKE ?` and pass `'%' + q + '%'` as a parameter (`api.js:30-31`).
2. Move the VM to Node 24 LTS. Set `"engines": { "node": ">=22.13" }` (`package.json:7`).
3. In `db.js`: open `new DatabaseSync(process.env.REMINDERS_DB ?? 'reminders.db')`, then run `CREATE TABLE IF NOT EXISTS` and turn on WAL. `SELECT` and `INSERT … RETURNING` use `.all()`, and `UPDATE`/`DELETE` return `.run().changes`.
4. Add `RETURNING *` to the INSERT, because `api.js:17` expects the new row back.
5. Keep `reset()` and `queryLog`. Tests set `REMINDERS_DB=:memory:` so they never touch the real file (`test/api.test.js:6`).

**True for any option:** delivery becomes **at-least-once**. `scheduler.js:16-17` sends first and marks the reminder sent after. A crash between those two lines resends it after the restart. Today that reminder is lost instead.

**Not verified:**
- I didn't prototype `node:sqlite`, because local Node is v20.19.0.
- Its version history comes from nodejs.org/api/sqlite.html.
- The Node 20 end-of-life date is from memory. Fetching the Node release schedule was denied.

**Also:** `scheduler.js:9` applies the timezone offset a second time, but `due_ms` is already UTC (`api.js:8`). IST reminders fire **5.5 h early** and US ones fire late. Tests miss this because every fixture uses offset 0.

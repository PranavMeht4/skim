**Use SQLite through Node's built-in `node:sqlite`, after upgrading Node.**
- **Why:** `src/db.js` already imitates SQL, and `DatabaseSync` is synchronous like the current `query()`. So almost all the change is inside `db.js`. You get crash-safe writes with no server and no npm package.
- **Blocker:** this machine runs **v20.19.0**. `node:sqlite` needs **≥22.13** to run without a flag. The Node docs (v26.12) mark it **1.2 release candidate** since v25.7; older versions still label it experimental. Node 20 has been past end of life since 2026-04-30, so you need to upgrade anyway.
- **If Node can't be upgraded:** use a JSON snapshot file (write to a temp file, fsync, rename). Or use `better-sqlite3` if you want real SQL on Node 20.
- **Required with SQLite:** `api.js:31` builds the search query by gluing user input into the SQL string. Against a real database, `q=' OR 1=1 --` returns **every user's reminders**. Switch it to `user_id = ? AND text LIKE ?`.
- **Not run:** I couldn't run `node --test` or the `node:sqlite` import check because both needed approval.

**Also:** `scheduler.js:9` subtracts the timezone offset again, but `due_ms` is already UTC (`api.js:8`). So IST reminders fire **5.5h early**. The tests miss it because they only use offset 0.

**Options**

| Option | Fits the README? | Crash safety | Cost |
|---|---|---|---|
| **`node:sqlite`** | yes, no deps, needs Node ≥22.13 | transactions, WAL | rewrite `db.js` + upgrade Node |
| `better-sqlite3` | yes on Node 20, adds a native npm package | transactions, WAL | same `db.js` rewrite, native build on the VM |
| JSON snapshot | yes on Node 20, no deps | safe only with temp + fsync + rename | ~25 lines, keeps the fake SQL parser, rewrites the whole file (~1 MB at 5,000 rows) on every change |
| Append-only JSONL | yes, no deps | must handle a half-written last line | replay + compaction code, no gain at this size |
| Postgres / Redis | **no**, needs a new server | strong | the README rules out new infrastructure |

**New behavior once storage persists**
1. **At-least-once delivery:** a crash between `send()` and the `UPDATE` (`scheduler.js:16-17`) means the reminder is sent again after restart.
2. **Catch-up burst:** after any downtime, the first tick sends every overdue reminder at once.
3. **Cutover loses today's rows:** the restart that ships this drops the ~2,000 reminders held in memory. No code path can export them first.
4. **DB file path:** resolve it the way `config.json` is resolved (`index.js:4`, `import.meta.url`). Don't use the working directory or `/tmp`, which can be wiped on reboot.

**Migration steps (SQLite path)**
1. Upgrade Node on the VM to a current LTS, and set `engines.node` to `>=22.13`.
2. In `db.js`:
   - Open `new DatabaseSync(path)`, set `PRAGMA journal_mode=WAL`, run `CREATE TABLE IF NOT EXISTS`, and add an index on `(sent, due_ms)`.
   - In `query()`: SELECT uses `.all()`, INSERT … `RETURNING *` uses `.all()`, and UPDATE/DELETE use `.run().changes`.
3. Parameterize the search at `api.js:31`.
4. Have tests open `':memory:'`, and make `reset()` run `DELETE FROM reminders`.

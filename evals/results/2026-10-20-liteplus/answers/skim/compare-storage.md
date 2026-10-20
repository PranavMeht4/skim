**Use Node's built-in SQLite (`node:sqlite`) with one database file, after upgrading the VM from Node 20 to Node 24 LTS. If Node can't be upgraded, use a JSON file that's rewritten atomically.**

1. **This needs a Node upgrade first.** Local Node is **v20.19.0**, which **doesn't have `node:sqlite`**. It's available without a flag from **22.13 / 23.4**. The Node docs label it **"Stability 1.2 – Release candidate"** (since 25.7), so it is **not yet marked stable**. Upgrading the VM is a deploy change you need to approve.
2. **Why SQLite:** the code already sends SQL, so `src/db.js` shrinks to about 30 lines and the regex SQL matcher goes away. Writes become **crash-safe transactions**, with **no npm dependencies** and **no server**. That fits the README: one process, under 5,000 rows, no new infrastructure.
3. **Fix before switching: SQL injection** at `src/api.js:31`. Search pastes `userId` and `q` straight into the SQL. Against the current regex matcher that's mostly harmless; against real SQLite anyone could inject SQL. Change it to `text LIKE ?` with the parameter `%${q}%`.
4. **The tests would wipe real data.** `test/api.test.js:6` calls `reset()` before every test. Make the database path configurable (e.g. `dbPath` in `config.json`) and use `:memory:` in tests.
5. **A reminder can be sent twice.** If the process crashes between `send()` and the `UPDATE` (`src/scheduler.js:16-17`), the reminder is **sent again after restart**. Today the same crash loses the reminder completely.
6. **If you stay on Node 20, use a JSON file:** write to a temp file, fsync, then rename it over the old one. Without the rename step, a crash mid-write **corrupts every reminder**.

| Option | Fits constraints? | Crash safety | Cost |
|---|---|---|---|
| **`node:sqlite`** (recommended) | Yes, after upgrading to Node ≥22.13; no npm deps | Transactions | ~30-line `db.js`; existing SQL runs unchanged |
| **JSON file, rewritten atomically** | Yes, works on Node 20 | Safe only with temp file + fsync + rename | ~25 lines; you keep the regex SQL matcher; every change rewrites the whole file, roughly 1 MB at 5,000 rows (estimate) |
| Append-only JSONL log | Yes, works on Node 20 | Good (a crash damages at most the last line) | Needs replay on start plus periodic compaction; more code than the JSON file and no benefit at 5k rows |
| `better-sqlite3` | **No**: native npm dependency | Transactions | Same API shape; only worth it if Node can't be upgraded *and* a dependency is acceptable |
| Postgres / Redis | **No**: the README rules out a new server | — | No good reason at 1 process and 5k rows |

How small the SQLite version is (**sketch only, not run**, since this machine has Node 20):

```js
import { DatabaseSync } from 'node:sqlite';
let db;
export function open(path) {          // index.js: open(config.dbPath); tests: open(':memory:')
  db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT, text TEXT, at TEXT, tz_offset_min INTEGER, due_ms INTEGER, sent INTEGER DEFAULT 0)`);
}
export function query(sql, params = []) {
  queryLog.push({ sql, params });
  if (/^\s*INSERT/i.test(sql)) return db.prepare(`${sql} RETURNING *`).all(...params);
  if (/^\s*SELECT/i.test(sql)) return db.prepare(sql).all(...params);
  return Number(db.prepare(sql).run(...params).changes);
}
```

`query()` should throw if `open()` was never called; a silent `:memory:` default would quietly lose data again. `reset()` becomes `DELETE FROM reminders; DELETE FROM sqlite_sequence`.

**Also:**
- **A separate bug:** `src/scheduler.js:9` subtracts the time-zone offset a second time. `due_ms` is already UTC (`src/api.js:8`), so **IST reminders fire 5.5h early**. The tests only cover offset 0. Fix it in the scheduler, **not** in the stored data; it doesn't affect the storage change.
- `queryLog` is exported but **no test reads it**, so the comment at `src/db.js:7` is out of date.
- **Not checked:**
  - Node 20's end-of-life date (I believe it was April 2026). My lookup of the release schedule was denied.
  - Whether `node:sqlite` still prints an `ExperimentalWarning` on load.
  - The sketch above, which has never been run.
- **Nothing implemented**; no files changed.

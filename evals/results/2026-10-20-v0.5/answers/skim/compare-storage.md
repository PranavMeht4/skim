**Use Node's built-in `node:sqlite`.** It adds no npm dependencies and no new infrastructure, and `src/db.js` already takes SQL.
1. **It needs Node ≥22.13** to run without a flag. The project is pinned to Node 20 (`package.json:7`; local Node is v20.19.0), and Node 20 reached **end of life on 2026-04-30**. Move to **Node 24 LTS** either way.
2. **Fix this before switching:** the search query is built by **string concatenation** (`api.js:31`). With real SQLite, `q=x%' OR 1=1 --` returns **every user's** reminders. Change it to `WHERE user_id = ? AND text LIKE ?` with `[userId, `%${q}%`]`.
3. **The change is small:** rewrite only `query()` in `db.js` and add `RETURNING *` to the INSERT (`api.js:18`). No caller changes, because `DatabaseSync` is **synchronous** like today's `query()`.
4. **Fallback if Node can't move:** a JSON file, written to a temp file, fsynced, then renamed. It's under ~1 MB at 5,000 rows.
5. **One trade-off:** delivery becomes **at-least-once**. A crash between `send` and the UPDATE (`scheduler.js:16-17`) means that reminder is sent again after restart.
6. **Not verified:** I ran **nothing SQLite-related**, since Node 20 doesn't have it. The `node:sqlite` facts come from the nodejs.org docs page (v26.12.0). The Node 20 end-of-life date is **from memory**, because the release-schedule fetch was denied.

| Option | Fits the README constraints? | Cost | Verdict |
|---|---|---|---|
| **`node:sqlite`** | Yes: 0 deps, a single file | Node bump; "release candidate" since v25.7.0 (may still warn as experimental on 22/24) | **Pick this** |
| JSON snapshot file | Yes, and works on Node 20 | Whole file rewritten on every change; you keep maintaining the hand-written SQL parser in `db.js` | Fallback |
| `better-sqlite3` | **No**: native npm dependency | Needs a prebuilt binary or build tools on the VM | Only if stuck on Node 20 **and** you need SQL |
| Append-only JSONL log | Yes | Replay and compaction code: more work than the snapshot for no gain at this size | Skip |
| Postgres / MySQL / Redis | **No**: new infrastructure | No strong reason for 1 process and <5k rows | Reject |

**Sketch of the new `db.js`** (keeps `queryLog` and `reset()`, which `test/api.test.js:4-6` uses):
```js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.REMINDERS_DB ?? 'data/reminders.db'); // ':memory:' in tests
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL,
    tz_offset_min INTEGER NOT NULL, due_ms INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`);

export function query(sql, params = []) {
  queryLog.push({ sql, params });
  const stmt = db.prepare(sql);
  if (/^\s*(SELECT|INSERT)/i.test(sql)) return stmt.all(...params).map((r) => ({ ...r }));
  return stmt.run(...params).changes; // UPDATE / DELETE return a row count, as today
}
```
- **Store the DB file on the VM's persistent disk**, not in a temp directory.
- `reset()` becomes `DELETE FROM reminders` plus clearing `queryLog`.

**Also:**
- **Timezone bug, separate from storage:** `scheduler.js:9` subtracts `tz_offset_min` from `due_ms`, but `due_ms` is already UTC (`api.js:8`). **IST reminders fire 5.5 h early**, and US ones fire late. The tests only pass because they use offset 0.

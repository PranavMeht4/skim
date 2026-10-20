**Use Node's built-in SQLite (`node:sqlite`). It needs the VM upgraded from Node 20, which is past end-of-life.**

| Option | Needs | Crash-safe | `db.js` work |
|---|---|---|---|
| **`node:sqlite`** | Node ≥ **22.13**, 0 deps | ✓ transactions | rewrite with real SQL |
| JSON file | nothing, runs on Node 20 | only with temp + fsync + rename | keep the toy parser, add load/save |
| `better-sqlite3` | first npm dep, native build | ✓ | same as `node:sqlite` |
| Postgres / Redis | new server | ✓ | async rewrite; the README rules these out |

**Why `node:sqlite`:**
- `db.js` already speaks SQL. The built-in driver is synchronous like `query()`, so `api.js`, `scheduler.js` and the tests keep their shape.
- It adds no dependencies and no new infrastructure.
- nodejs.org lists Node **20** as EOL, so the VM needs upgrading anyway. Node 22 and 24 are LTS.
- The JSON file is the fallback if the upgrade is blocked. At 5k rows (about 1 MB), rewriting the whole file on each change is fine.

**Plan:**
1. Upgrade the VM to Node 24 LTS and set `engines` to `>=22.13`.
2. Rewrite `src/db.js` with `DatabaseSync`, keeping what callers rely on:
   - `query()`, `reset()` and `queryLog` stay.
   - INSERT uses `RETURNING *` so it still returns `[row]`.
   - UPDATE and DELETE return the number of rows changed.
3. Add `dbPath` to `config.json`. Tests use `:memory:` so `reset()` can never wipe real data.
4. Parameterize the search query in `api.js:30-31` before switching (see Risk).
5. Add a restart test: write, reopen the file, read the row back.

**Not verified:**
- I wrote no code. The local Node is `v20.19.0`, so I couldn't run `node:sqlite` here.
- On Node 22 and 24, `node:sqlite` is labelled **experimental**. The Node docs list it as a release candidate (stability 1.2) only from v25.7.0.
- I assumed the VM's disk survives restarts.

⚠ **Risk:**
- **SQL injection:** the search route (`api.js:30-31`) pastes `userId` and `q` straight into the SQL string. The toy parser happens to block abuse today. Under real SQLite, `userId=x' OR '1'='1` would return **every user's** reminders. Switch to `text LIKE ?` and add the `%` signs in JS.
- **Duplicate sends:** a crash between sending and marking sent (`scheduler.js:16-17`) re-sends after restart. Reminders that came due during downtime all fire at once on startup. Every option above has both problems.
- **Single copy:** the DB file becomes the only copy of the data, so back it up.
- **Separate bug, not storage:** `scheduler.js:9` subtracts `tz_offset_min` from `due_ms`, which `api.js:8` already stored as UTC. IST reminders fire **5h30m early**. The tests miss it because they only use offset 0.

❓ **Needs you:** Can the VM move to Node 24 LTS? If yes, I'll implement `node:sqlite`. If not, I'll do the JSON file. Should I fix the timezone bug in the same change, or separately?

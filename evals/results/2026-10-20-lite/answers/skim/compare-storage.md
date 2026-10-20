**Recommendation: an atomic JSON snapshot file behind the existing `src/db.js` interface.** It meets every constraint in the README today. Move to `node:sqlite` only once the VM is on Node 22 or later.

1. **It fits the constraints:** one process, fewer than 5,000 rows, no dependencies, no new infrastructure, and it runs on **Node 20** (installed here: `v20.19.0`).
2. **Only `src/db.js` changes:** it loads the file on start and saves after each INSERT, UPDATE or DELETE. `api.js` and `scheduler.js` stay as they are.
3. **The file stays small:** about 5,000 rows × ~200 bytes is **about 1 MB at most**, rewritten on every change. That's an estimate, **not benchmarked**, because the timing command wasn't approved.

| Option | Fits the README? | Work | Main risk |
|---|---|---|---|
| **JSON snapshot** (write temp file → fsync → rename) | **Yes**: Node 20, no deps | About 40 lines in `db.js` | Whole file rewritten per change; keeps the hand-written SQL matcher |
| **`node:sqlite`** (built into Node) | Only after upgrading to **Node ≥22.13** | Thin `DatabaseSync` wrapper; the SQL mostly stays | Experimental status; **makes the injection in `api.js:31` exploitable** |
| **`better-sqlite3`** | **No**: native npm dependency | Same as above, plus a build toolchain | Native build on the VM; breaks "no dependencies" |
| **Append-only JSONL log** | Yes | Replay and compaction code | More code than a snapshot, with no gain at 5k rows |
| **Postgres / Redis** | **No**: new infrastructure | A server, backups, operations | Ruled out by the README |

**Doing the snapshot safely:**
1. **Write atomically:** write `reminders.json.tmp`, call `fsyncSync`, then `renameSync` it over the real file. **Never** write the real file in place: a crash mid-write corrupts it.
2. **Save `nextId`** alongside the rows, or ids get reused after a restart.
3. **Save synchronously** inside `query()`, so `sent = 1` (`scheduler.js:17`) is on disk before the next send.
4. **Make the file path configurable**, so `node --test` **never** touches the real file. Keep `reset()` and `queryLog`.
5. If the file is missing, start empty. If it **can't be parsed, fail loudly**; starting empty would silently delete every reminder.

**After a restart (this applies to every option):**
- **Delivery is at-least-once.** The reminder is sent first and `sent = 1` is saved afterwards (`scheduler.js:16-17`). A crash between the two **re-sends** it after restart. Persistence makes that window smaller; it does **not** remove it.
- **Overdue reminders arrive in a burst:** everything that came due during downtime fires on the **first tick**.

**When `node:sqlite` is the better choice:**
- **You're moving the VM off Node 20 anyway.** As I recall, Node 20 reached **end of life on 2026-04-30**. **Not verified**: web search was denied.
- It gives you real transactions and indexes, and the code already uses SQL. INSERT needs `RETURNING *`; UPDATE and DELETE return `.run().changes`.
- **Fix this first:** `api.js:30-31` builds the search SQL by joining strings. Today's in-memory matcher can't run injected SQL, but real SQLite would. For example, `q = "' OR 1=1 --"` returns **every user's reminders**. Fix it with `WHERE user_id = ? AND text LIKE ?` and the parameter `` `%${q.q}%` ``. The current `db.js` already supports `?` in LIKE, so this fix can go in now.
- **Not tested here** (local Node is v20.19.0). That it is still marked experimental is also from memory and **not verified**.

**Also:**
- **Time-zone bug:** `scheduler.js:9` subtracts `tz_offset_min` again, but `due_ms` is already UTC (`api.js:7-9`). Reminders for IST users fire **5.5 h early**; for US Eastern (−300) they fire **5 h late**. The tests miss it because they only use offset 0. Fix the scheduler, not the stored value, so persisted rows need no migration.
- `src/index.js` only starts the scheduler; **nothing serves** `api.handle`.

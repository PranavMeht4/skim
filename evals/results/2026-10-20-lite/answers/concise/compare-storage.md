I recommend an **atomic JSON snapshot file behind the existing `query()` interface in `src/db.js`.** It's the only option that meets every constraint in the README as things stand: Node 20, no dependencies, no new infrastructure, one process, under 5k rows. The callers in `api.js` and `scheduler.js` don't need to change.

| Option | Survives restart | Fits constraints | Cost / risk |
|---|---|---|---|
| **JSON snapshot** (rewrite the whole file on each change) | Yes, if written atomically | Yes | About 1 MB rewritten per change at 5k rows, which is cheap. Around 40 lines of code. |
| Append-only JSONL log, replayed on start | Yes | Yes | Needs replay and compaction logic, which buys nothing at this size. |
| `node:sqlite` (built into Node) | Yes, crash-safe | Not on Node 20; it first shipped in 22.5 | Needs a Node upgrade and is still marked experimental. Good fit, since the code already speaks SQL. |
| `better-sqlite3` | Yes | No: it's a native npm dependency | Native build step on the VM. |
| Postgres or Redis | Yes | No: new infrastructure | Overkill for one process and 5k rows. |

**Exception:** Node 20 reached end-of-life in April 2026, so you'll need to upgrade soon anyway. If you upgrade to Node 22 or 24 now, `node:sqlite` is the stronger choice: you get real SQL and transactions, and you can delete the fake SQL parser.

**Getting the JSON snapshot right:**
- Write to a temp file in the same directory, fsync it, then rename it over the real file. Use the sync versions (`writeFileSync`, `fsyncSync`) so `query()` stays synchronous.
- Store `nextId` along with the rows. Otherwise, after a restart, new reminders reuse the IDs of deleted ones.
- At startup, a missing file means start empty. A file that won't parse must crash the service. If it started empty instead, the next write would overwrite the real data.
- Make the file path configurable so the tests that call `reset()` never touch real data.

**Things to know:**
- **SQL injection:** `searchReminders` (`src/api.js:31`) builds SQL by gluing user input into the query string. The current fake parser mostly blunts that, but under a real SQLite database it becomes a live SQL injection. Switch it to `?` parameters before any move to SQLite.
- **Duplicate sends:** once data persists, a reminder can be sent twice. If the process crashes between `send()` and the `UPDATE … sent = 1`, it resends that reminder after restart. That's usually acceptable.
- **Unrelated bug:** `dueReminders` (`src/scheduler.js:9`) subtracts the timezone offset from `due_ms` again, but `due_ms` is already UTC. Reminders for users outside UTC fire early; IST users get theirs 5.5 hours early.

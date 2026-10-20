**Use a JSON file, rewritten atomically on every change.**
- **Why it wins:** it fits every limit in the README and runs on Node 20 (README.md:14)
- **Cost:** about 25 lines in `db.js`. Callers and SQL strings stay the same (src/db.js:4)
- **Must handle:** save `nextId`, write via temp file → fsync → rename, keep tests in memory
- **Later:** Node 20 is past end-of-life. After upgrading, move to the built-in `node:sqlite`
- **Also:** IST reminders fire 5.5h early because the offset is applied twice (src/scheduler.js:9)

───

**Options compared**

| Option | Fits the README? | Work | Verdict |
|---|---|---|---|
| JSON file, atomic rename | Yes: Node 20, no deps | ~25 lines in `db.js` | **Use now** |
| `node:sqlite` (built in) | Needs Node ≥22.13 | Rewrite `db.js`, fix search | Use after upgrade |
| `better-sqlite3` | First dependency, native build | Same as above, plus npm | Only if stuck on Node 20 |
| Append-only JSONL log | Yes | Log, replay, compaction | More work, no gain at 5k rows |
| Postgres / Redis | No: needs a server | High | Ruled out (README.md:17) |

**Why a plain file is enough here**
- 5,000 rows is roughly 1 MB of JSON. That's my estimate; I didn't measure it. Rewriting it on each change is cheap.
- The rename is atomic, so a crash leaves either the old file or the new one, never half of each.
- There is only one process, so nothing else ever writes to the file.
- Move to SQLite if a second process appears or the data grows by orders of magnitude.

**Sketch** (`index.js` calls `open(config.dbPath)`. Tests never call it, so they stay in memory and `reset()` can't wipe real data.)

```js
import { readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs';

let file = null;

export function open(path) {
  file = path;
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  rows.push(...data.rows);
  nextId = data.nextId;            // or max(id) + 1, otherwise ids collide
}

function save() {
  if (!file) return;
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w');
  writeFileSync(fd, JSON.stringify({ nextId, rows }));
  fsyncSync(fd);
  closeSync(fd);
  renameSync(tmp, file);
}
// call save() after every INSERT, UPDATE and DELETE that changes a row
```

For full safety against power loss, also fsync the directory after the rename.

**New behaviour once data survives restarts**
- **Duplicate sends:** if the process crashes between `send` and `UPDATE ... sent = 1`, that reminder goes out again after restart (src/scheduler.js:16). For reminders, that's acceptable.
- **Late catch-up:** reminders that came due while the service was down are sent on the first tick after restart, about 30s after start.

**Before any SQLite option**
- **SQL injection:** `searchReminders` builds SQL by joining strings (src/api.js:31). Today the toy matcher only supports `AND`, which limits the damage. Real SQLite would allow full injection, so parameterize this query first.
- **Test hooks:** keep `reset()` and `queryLog` in the wrapper, because `api.test.js` uses `reset()`.

**Scheduler bug (from reading the code, not from running it)**
- `due_ms` is already UTC (src/api.js:7). Line 9 subtracts `tz_offset_min` again.
- Result: IST (+330) reminders fire 5.5h early, and UTC−5 reminders fire 5h late.
- The tests only use offset 0 (test/scheduler.test.js:6), so they miss it. The fix is `r.due_ms <= nowMs`.

**Assumptions and what I didn't check**
- **Node version:** this machine runs v20.19.0. I don't know what the VM runs.
- **Node 20 end-of-life:** 2026-04-30, from the published schedule. My fetch of the release page was blocked, so I didn't re-check it.
- **`node:sqlite` status:** the current docs (v26.12.0) list it as release candidate (stability 1.2) since v25.7.0. It hasn't needed a flag since v22.13.0 / v23.4.0, but on those versions it was still marked experimental. I didn't check whether the 22 or 24 LTS lines carry the release-candidate label.

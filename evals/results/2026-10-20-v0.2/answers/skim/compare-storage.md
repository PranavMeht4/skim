**Pick: a JSON file, rewritten atomically on every change.** It's the only option that breaks none of the README's rules.

| Option | Breaks a README rule? | Catch |
|---|---|---|
| **JSON file, atomic write** | **no** | rewrites about 1 MB per change at 5k rows, which is fast |
| Append-only JSONL log | no | needs replay and compaction; gains nothing at this size |
| `node:sqlite` (built-in) | **yes: needs Node ≥22.13** | this machine runs **v20.19.0** |
| `better-sqlite3` | **yes: first dependency** | native add-on that must build on the VM |
| Postgres / Redis | **yes: new infra** | a server to run for 5k rows |

**SQLite later, not yet.** `node:sqlite` came in v22.5.0 and stopped needing a flag in v22.13.0. Node 20 reached end of life on 2026-04-30, so an upgrade is due anyway. Once you upgrade, `node:sqlite` is the better long-term store, because the code already writes SQL. Before switching, parameterize `src/api.js:31`. It builds the search query by string concatenation, which is harmless against the toy parser but **real SQL injection** against SQLite.

**What the JSON file needs, all in `src/db.js`:**
1. **Persist `nextId` with the rows.** Otherwise ids restart at 1 after a restart and collide with existing ones.
2. **Atomic write:** write a temp file, fsync it, then rename it over the real one. A crash mid-write then leaves the old file intact.
3. **Synchronous writes.** Ticks can overlap, since 5 retries with up to 10s backoff each can outlast the 30s interval. Sync writes can't interleave.
4. **Fail loudly on a corrupt file.** If it silently starts empty, the next save wipes all reminders.
5. **Take the path from an env var.** When it's unset, tests stay in memory and `reset()` keeps working (`test/api.test.js:6`).

```js
const FILE = process.env.REMINDERS_DB; // unset in tests → memory only

function load() {
  if (!FILE || !existsSync(FILE)) return;
  const data = JSON.parse(readFileSync(FILE, 'utf8')); // throws if corrupt
  rows.push(...data.rows);
  nextId = data.nextId;
}

function save() {
  if (!FILE) return;
  const tmp = `${FILE}.tmp`;
  const fd = openSync(tmp, 'w');
  writeFileSync(fd, JSON.stringify({ nextId, rows }));
  fsyncSync(fd);
  closeSync(fd);
  renameSync(tmp, FILE);
}
// call load() once at module init; save() after INSERT, UPDATE and DELETE
```

**Tradeoffs to accept (true of every option):**
- **Delivery is at-least-once.** A crash between `send` and `UPDATE ... sent = 1` (`src/scheduler.js:16-17`) re-sends that reminder on restart.
- Reminders that came due while the service was down all fire together on the first tick.

**Not verified:** I didn't run the tests or try `node:sqlite` here, because both commands needed approval. I took the "release candidate" status from the v26.12.0 docs; I didn't check whether the v22 and v24 docs still call it experimental. The Node 20 end-of-life date is from memory, since the fetch of the release schedule was blocked.

**Also:** `src/scheduler.js:9` subtracts `tz_offset_min` a second time, but `due_ms` is already UTC (`src/api.js:8`). As a result, IST reminders fire **5.5 hours early**, and negative offsets fire late. The tests miss this because they only use offset 0.

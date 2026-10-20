**A one-process Node 20 reminder scheduler**: about 200 lines, no dependencies, and not production-ready yet.

- **What runs:** `src/index.js:6` reads `config.json` (tick every **30s**, formatter `legacy`) and starts the scheduler. It does nothing else.
- **No HTTP server:** `handle()` in `src/api.js:41` routes create/list/search/delete, but only the tests call it.
- **Delivery:** on each tick, `scheduler.js:12` loads unsent rows, keeps the due ones, calls `send` with **5 attempts**, then sets `sent = 1`.
- **Output:** `notify.js:14` loads the formatter named in config and `console.log`s the result. There is no real channel (SMS, email) yet.
- **Storage:** `db.js` is a fake SQL engine that lives in memory. **Everything is lost on restart.** The README already lists this as the open item.
- **Tests:** `npm test` runs 11 tests in 4 files. **I didn't run them** because the node command needed approval.

**Also:**
1. **Non-UTC users get reminders at the wrong time.** `due_ms` is already UTC (`api.js:8`, `README.md:37`), but `scheduler.js:9` subtracts the offset again. IST users get theirs **5h30m early**. Fix: `r.due_ms <= nowMs`. The comment at `scheduler.js:7` is the wrong side.
2. **A search containing "and" crashes.** `api.js:31` builds SQL by joining strings. For a search like "milk and eggs", `db.js:29` splits on " AND " (any case) and throws `unsupported condition`. Once db.js becomes a real database, this is SQL injection.
3. **No auth:** anyone can list or delete any user's reminders by `userId` or `id`.
4. **`legacy` is the live format** (`config.json:3`, and `notify.js:14` defaults to it too). Deleting it per the TODO at `legacy.js:2` breaks every send.
5. **Risk of sending twice once sends go over a network.** `setInterval` doesn't wait for the last tick to finish. Each failing send spends about 3s in retries, so about 10 failures overrun a 30s tick.

**Flow**
```
config.json ─> index.js ─> startScheduler: setInterval(tick, 30s)
                                 │
          tick(): SELECT * FROM reminders WHERE sent = 0   (db.js)
                                 │
                   dueReminders(rows, now)   ← bug #1 here
                                 │
       withRetry(send, 5 attempts, waits 200ms → 1.6s, ±500ms jitter)
                                 │
     notify.send: import(`./${formatter}.js`) → console.log(line)
                                 │
          UPDATE sent = 1        (on failure: stays unsent, next tick retries)

api.handle({method, path, query, body}) → {status, body}   (tests only)
```

**Per-file notes**
| File | Key exports | Know this |
|---|---|---|
| `db.js` | `query`, `reset` | Regex parsing; handles only `=`/`LIKE` joined by `AND` |
| `retry.js` | `withRetry` | Delay `200·2^n`, max 10s |
| `notify.js` | `send` | Formatter = a filename in `src/`: `legacy` or `format` |
| `scheduler.js` | `tick`, `dueReminders` | First tick runs after 30s, not at startup |

**Message formats**
- `legacy`: `REMIND|u1|2026-03-01T09:00|call mum`
- `format`: `Reminder for u1: call mum (set for 2026-03-01T09:00)`

**Reminder row:** `id`, `user_id`, `text`, `at` (local `YYYY-MM-DDTHH:mm`), `tz_offset_min` (east is positive, IST = 330), `due_ms` (UTC epoch ms), `sent` (0 or 1).

**Constraints from the README:**
- One VM, one process, and no plan for a second.
- About 2,000 reminders today, expected to stay under 5,000.
- Must survive restarts.
- No database server or queue without a strong reason, and no dependencies.

Any replacement for `db.js` must keep the `query(sql, params)` and `reset()` interface, because the tests use it.

**Minor:**
- Offsets are fixed when a reminder is created, so reminders that cross a DST change arrive 1h off.
- The `db.js:7` comment says tests use `queryLog`, but none do.
- `startScheduler` never catches a rejected `tick()`, so if a future database throws during a query, Node 20 exits the process.
- Bug #1 passes the tests because `scheduler.test.js` only uses `tz_offset_min: 0`.

**Not verified:** every finding above comes from reading the code. I didn't execute any of it.

**Create → store in memory → 30s tick → retry → print to stdout.**
- **API not served:** `handle()` is a plain function. Nothing connects it to HTTP (`src/index.js:6`)
- **Memory only:** all data is lost on restart, but the README says it must survive (`src/db.js:4`)
- **Delivery stub:** "sending" means `console.log`, and the live format is legacy (`config.json:3`)
- **Tests not run:** I wasn't given permission to run `node --test`, so nothing below was run
- **Also:** time zones are converted twice, so IST reminders fire 5.5h early (`src/scheduler.js:9`)

───

**Ground rules from the README.** Every change has to fit these:
- One VM, **one process**, and no plan for a second instance.
- About **2,000** reminders today, expected to stay under **5,000**.
- No new infrastructure (no database server, no queue) without a strong reason.
- Node 20, ES modules, **zero dependencies**.

**How it runs**

```
index.js ── reads config.json ──> startScheduler(every 30s)
                                       │
                                       v
                              tick(): SELECT sent = 0
                                       │ dueReminders()
                                       v
                       withRetry(send, 5 attempts, exp backoff)
                                       │
                         ok ───────────┴────────── fail
                          │                         │
                  UPDATE sent = 1          log error; next tick retries

api.js handle({method, path, query, body})   <- not called by anything in src/
  POST   /reminders         create (converts local time to UTC)
  GET    /reminders         list by userId
  GET    /reminders/search  text search
  DELETE /reminders/:id
```

**What's real and what's a stub**

| File | Status | Notes |
|---|---|---|
| `api.js` | logic is real, not served | only tests call it |
| `db.js` | stand-in | parses only the SQL the service uses; `queryLog` is there for tests |
| `scheduler.js` | real | `setInterval` loop |
| `retry.js` | real | base 200ms, doubles each time, ±500ms jitter |
| `notify.js` | stub output | loads the formatter by name from config |
| `format.js` / `legacy.js` | real | prod uses `legacy` (pipe format); legacy has a TODO to remove it |

**Gotchas, worst first** (all found by reading the code, none observed running)

1. **Time zones converted twice.** `toUtcMs` already stores `due_ms` as UTC (`src/api.js:8`). Then `dueReminders` subtracts `tz_offset_min` again (`src/scheduler.js:9`). The comment on line 7 says `due_ms` is wall-clock time, which contradicts both the README and `api.js`.
   - An IST user picks 09:00. The stored time is 03:30Z, but the reminder fires at 22:00Z the day before (03:30 IST), **5.5h early**.
   - An offset of −300 fires **5h late**.
   - The tests miss it because the scheduler test only uses offset 0 (`test/scheduler.test.js:6`). The create test also uses the default offset of 0 (`test/api.test.js:17-20`).

2. **Search SQL is built by joining strings** (`src/api.js:31`).
   - It breaks today: searching "bread and butter" throws. The fake parser splits conditions on `AND` (`src/db.js:29`) and then hits `unsupported condition`. `handle()` has no try/catch, so the error reaches the caller.
   - It becomes real SQL injection once `db.js` is swapped for a real database. List and create already use `?` params; search should too.

3. **Ticks can overlap.** `setInterval` (`src/scheduler.js:26`) doesn't wait for the async `tick` to finish. Each failing reminder sleeps about 3s across its retries (200+400+800+1600ms). So about 10 failing reminders push one tick past 30s. The next tick then re-selects rows that are still being sent, which can send them twice.

4. **Smaller gaps:**
   - **No auth:** `userId` comes from the client, so anyone can list or delete any user's reminders.
   - **Bad dates accepted:** an invalid `at` gives `due_ms = NaN`. Create returns 201, but the reminder never fires.
   - **No DST:** the offset is fixed when the reminder is created.
   - **Uncaught tick errors:** the promise from `tick()` in `startScheduler` is never caught. A DB error there becomes an unhandled rejection.
   - **Fragile config:** `formatter` is a module name that `notify.js` imports dynamically. A typo, or a name like `"db"`, fails on every send.

**Commands** (from the README)

```
node src/index.js     # start the scheduler
node --test test/     # run the tests
```

The tests cover `toUtcMs`, the API happy paths, `withRetry` and the `format` formatter. They don't cover `tick()`, non-zero offsets in the scheduler, search, or the `legacy` formatter.

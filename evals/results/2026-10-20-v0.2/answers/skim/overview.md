**A single-process Node 20 reminder scheduler: about 150 lines and no dependencies.**

1. **What it does:** it stores reminders. Every 30s a loop (`config.json:2`) prints the due ones to **stdout**. There is no real delivery channel yet.
2. **The API is not connected:** nothing serves `handle()` in `api.js` over HTTP. Only the tests call it, so the running process can never receive a reminder.
3. **Nothing persists:** `db.js` is a fake SQL layer over an array, and a restart loses everything. The README calls this the main open requirement.
4. **Live bug, timezones:** the UTC conversion runs **twice** (`api.js:8` and `scheduler.js:9`). IST reminders fire **5h30m early** and US ones fire late.
5. **Live bugs, input:** an `at` in any other format returns 201 but **never fires**. A search containing " and " **throws** (`db.js:29`).
6. **Production uses the `legacy` format** (`config.json:3`). It has **no test**, and a TODO says to delete it.
7. **There are 11 tests in 4 files, and I did not run them.** The command needed approval this session couldn't give, so everything here comes from reading the code.

**How a reminder flows**
```
config.json ─► index.js ─► startScheduler()   setInterval every 30s
                               │
                               ▼
                 tick()   scheduler.js:12
                               │  SELECT * FROM reminders WHERE sent = 0
                               ▼
                 dueReminders()   filters by due_ms   (tz bug here)
                               │
                               ▼
                 withRetry(send, 5 attempts)   retry.js
                               │
                               ▼
                 send(): load formatter by name ─► console.log   notify.js
                               │  on success
                               ▼
                 UPDATE reminders SET sent = 1

Not connected to the running process:
  handle(req) ─► createReminder ─► toUtcMs ─► INSERT        api.js
```

**Files**
| File | Role | Watch out |
|---|---|---|
| `src/index.js` | Reads config, starts the loop | Never starts the API |
| `src/api.js` | `handle()` routes create, list, search, delete | No server, no auth, search builds SQL from strings |
| `src/db.js` | Fake SQL over an in-memory array | Parses only the 4 statements in use |
| `src/scheduler.js` | `tick()`: finds due reminders, sends, marks sent | Double tz shift, line 9 |
| `src/retry.js` | Backoff from 200ms, doubling, ±500ms jitter | — |
| `src/notify.js` | Loads the formatter by name with `import()` | Output is `console.log` |
| `src/format.js`, `legacy.js` | Message formats | Production runs `legacy` |

**Data contract.** `due_ms` is a **UTC** epoch (`README.md:37`, `api.js:8`). `at` and `tz_offset_min` hold the user's original input. `db.js:45` adds `sent` (0 or 1).

**Deploy constraints** (`README.md:14-17`): one process, under 5,000 reminders, must survive restarts, and no new infrastructure. So the expected persistence fix is a local file, or SQLite behind the same `query()` interface. Note that built-in `node:sqlite` needs Node ≥22.5, while `package.json` allows Node ≥20.

**Bug details**

- **Timezone double shift.** `toUtcMs` already returns UTC. `dueReminders` then subtracts `tz_offset_min` again, and its comment on `scheduler.js:7` wrongly says `due_ms` is wall-clock time. Example: 09:00 IST is stored as 03:30Z, but it fires at 22:00Z the day before. That is 03:30 IST, 5h30m early. `scheduler.test.js` only uses offset 0, so the tests miss it. Fix: compare `r.due_ms <= nowMs` directly and add a test with offset 330.
- **Silent NaN.** `toUtcMs` appends `:00Z` to `at`. Any `at` with seconds or a zone, such as `2026-03-01T09:00:00`, makes `Date.parse` return `NaN`. `NaN <= now` is always false, so the reminder never fires. `createReminder` does no format check (`api.js:13`).
- **Search.** `api.js:31` concatenates user input into the SQL string. `db.js:29` splits conditions on `AND` without regard to case. So `q = "milk and eggs"` throws `unsupported condition: text LIKE '%milk`, and `handle` doesn't catch it. SQL injection is limited by the toy parser today, but it becomes real once a real database replaces `db.js`. Fix: use `?` params with `` `%${q.q}%` ``.
- **Legacy format.** Production runs `legacy` (`config.json:3`), and `notify.js:14` defaults to it too. `notify.test.js` only tests `format`. If `legacy.js` is deleted as its TODO asks, startup still shows no error. Every send then fails its `import()` and is retried 5 times on every tick, forever.
- **Overlapping ticks (latent).** `setInterval` doesn't wait for the async `tick` (`scheduler.js:26`). A failing reminder uses about 3s of backoff across its 5 attempts, so about 10 failures push a tick past 30s. The next tick then selects reminders that are still being sent, and they go out twice. This can't happen today because `console.log` never fails, but it will matter once there is a real channel.

**Tests.** Run them with `npm test` (`node --test test/`). The 11 tests are 5 in api, 2 in scheduler, 3 in retry and 1 in notify. Not covered: search, `tick()`, a non-zero timezone in the scheduler, and the `legacy` formatter.

**Also:** there is no auth. List and search trust whatever `userId` the caller passes, and delete has no owner check (`api.js:35`). Retry jitter (±500ms) is larger than the 200ms first delay, so early retries can fire with no wait.

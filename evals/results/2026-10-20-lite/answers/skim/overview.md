**`reminder-service` is a tiny Node 20 scheduler (351 lines, no dependencies) that stores reminders in memory and logs them when they're due.** It has no HTTP server, and five traps are worth knowing on day 1.

**Before you start**
1. **No HTTP server:** `index.js` only starts the scheduler. `handle()` in `api.js:41` is called only by the tests.
2. **Nothing is saved:** `db.js` keeps rows in memory, so a restart loses them all. The README says the service must survive restarts and admits it **doesn't yet**.
3. **Reminders fire at the wrong time unless the offset is 0:** the timezone offset is applied twice (`api.js:8` and again at `scheduler.js:9`). An IST user (offset 330) gets their reminder about **5.5h early**; a US Eastern user (offset −300) gets theirs about **5h late**. I worked this out by hand and **didn't run it**.
4. **Production uses the old message format:** `config.json:3` sets `"legacy"`. The TODO in `legacy.js:2` invites deleting that file, which **would break delivery**.
5. **SQL built by joining strings** in search (`api.js:31`). The in-memory store limits the damage today, but it becomes a **real injection risk** once a real database replaces `db.js`.

**I didn't run the tests:** permission to run `node` was denied, so I can't say whether they pass.

## Flow
```
index.js ── reads config.json {tickSeconds: 30, formatter: "legacy"}
   └─ setInterval(tick, 30s)                       scheduler.js:26
        └─ SELECT * WHERE sent = 0                 scheduler.js:13
             └─ dueReminders(rows, now)            scheduler.js:9
                  └─ withRetry(send, 5 attempts)   retry.js:14
                       └─ notify.send → import(`./${formatter}.js`) → console.log
                  └─ UPDATE sent = 1               scheduler.js:17
                  (on failure: log it; the next tick tries again)

api.js handle(req)  POST/GET /reminders, GET /reminders/search, DELETE /reminders/:id
   └─ db.query(sql, params)   (only the tests call this)
```

## Files
| File | Role |
|---|---|
| `src/index.js` | Entry point: reads `config.json` and starts the scheduler |
| `src/api.js` | Plain function handler, `{method, path, query, body}` → `{status, body}` |
| `src/db.js` | In-memory **fake SQL**. Supports only the exact statements the code uses and logs every query to `queryLog` for tests |
| `src/scheduler.js` | Finds due, unsent reminders and sends them one at a time |
| `src/retry.js` | Exponential backoff (200ms base, 10s cap) plus ±500ms jitter |
| `src/notify.js` | Loads the formatter **by file name** from config and writes the result to `console.log` |
| `src/format.js` / `legacy.js` | New message format / old pipe-delimited format |

## Reminder fields
- `at`: the local time the user picked, `YYYY-MM-DDTHH:mm`
- `tz_offset_min`: the user's offset from UTC in minutes, east positive (IST = 330)
- `due_ms`: the **UTC** epoch time in ms. It's already converted, and `api.test.js:12-13` confirms that. The comment at `scheduler.js:7` is wrong, and that wrong comment is the cause of trap 3.

## Constraints from the README
- **One process on one VM**, with no plans for a second instance.
- Under 5,000 reminders; the README says about 2,000 today. Nothing in this repo can be holding them (no server, in-memory store), so I couldn't verify where they live.
- **No new infrastructure** (no database server, no queue) without a strong reason.

## Tests (`node --test test/`)
- They cover `toUtcMs`, create/list/delete, `dueReminders`, `withRetry` and the **`format`** formatter.
- **Not covered:** search, `tick()`, the `legacy` formatter (the one production uses) and any non-zero offset in the scheduler. `scheduler.test.js:6` only uses offset 0, which is why trap 3 slips through.

**Also:**
- **Ticks can overlap:** `setInterval` doesn't wait for the async `tick`. A reminder that fails all 5 attempts spends about 3s backing off, so about 10 of them take longer than the 30s interval. The next tick then re-reads unsent rows and can **send duplicates**. I reasoned this through but didn't reproduce it.
- **No auth:** any caller can pass any `userId`, and delete doesn't check who owns the reminder (`api.js:35`).
- An invalid `at` gives a `NaN` `due_ms`. The API still returns 201, but that reminder **never fires**.
- `GET /reminders` with no `query` object crashes with a TypeError (`api.js:25`).
- Reminders that always fail are **retried forever**, 5 attempts on every tick, with no limit.

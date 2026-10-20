**reminder-service is a ~350-line, zero-dependency Node 20 service. It stores reminders in memory, and a loop that runs every 30s "delivers" them by printing to stdout.**

## Know this first
- **There is no HTTP server.** `handle()` (`src/api.js:41`) is a plain function that only tests call. `src/index.js` starts the scheduler and nothing else.
- **Delivery is `console.log`.** `send()` defaults `out` to `console.log` (`src/notify.js:14`). No real channel exists yet.
- **Nothing persists.** `src/db.js` is a fake SQL database in memory that parses queries with regex. Every reminder is lost on restart.
- **Production uses the old message format.** `config.json` sets `"formatter": "legacy"`, and `src/legacy.js:2` marks that format TODO-remove. The "current" format, `src/format.js`, is used only in a test.

## How it flows
```
POST /reminders ─► api.handle ─► toUtcMs(at, tz) ─► db INSERT
                   (tests only)   due_ms = UTC          │
                                                        ▼
index.js ─► startScheduler ─► setInterval(tick, 30s)
              tick ─► SELECT * WHERE sent = 0
                   ─► dueReminders(rows, now)
                   ─► withRetry(send, 5 attempts)
                        └► import(`./${formatter}.js`) ─► console.log
                   ─► UPDATE sent = 1   (on failure: stays 0, retried next tick)
```

## Files
| File | Role |
|---|---|
| `src/index.js` | reads `config.json`, starts the scheduler |
| `src/api.js` | create / list / search / delete routes |
| `src/db.js` | fake SQL in memory; `queryLog` is there for tests |
| `src/scheduler.js` | finds due reminders, sends them, marks them sent |
| `src/retry.js` | exponential backoff with ±500ms jitter |
| `src/notify.js` | loads the formatter by name from config, sends |
| `src/format.js` / `src/legacy.js` | new / old message formats |
| `test/*.test.js` | 4 files using `node:test`, no mocks library |

**Run:** `npm start` (scheduler) · `npm test` (`node --test test/`)

**Constraints from the README:** one process on one VM. About **2,000** reminders, staying under **5,000**. It **must survive restarts**, which it does not do yet. No new infrastructure. The obvious next job is persistence.

## Known issues, worst first

**1. Reminders fire at the wrong time for every user not on UTC.**
- **Cause:** the timezone offset is applied twice. `toUtcMs` already stores `due_ms` as UTC (`src/api.js:16`). Then `src/scheduler.js:9` subtracts `tz_offset_min` again. The comment at `:7` contradicts the README's definition of `due_ms`.
- **Proof (worked by hand):** an IST user (offset 330) sets 19:00. That is stored as 13:30Z, and the scheduler fires at 08:00Z, which is **13:30 IST, 5h30m early**. A user at offset −300 (US Eastern) gets theirs **5h late**.
- **Why tests miss it:** the fixture in `test/scheduler.test.js:6` uses offset 0, and the create tests use the default of 0.
- **Fix:** change `src/scheduler.js:9` to `r.due_ms <= nowMs`, and add a test that goes from create to due with offset 330.

**2. Search builds SQL by string concatenation (`src/api.js:30-31`).** `q.userId` and `q.q` are pasted straight into the query. Today's fake database is hard to exploit because its parser doesn't support `OR`. Once `db.js` is replaced by a real database such as SQLite, this becomes real SQL injection, and any caller could read other users' reminders. The fix is `WHERE user_id = ? AND text LIKE ?` with params `[q.userId, `%${q.q}%`]`. The fake database already supports `LIKE ?`.

**3. Ticks can overlap and send duplicates.** `setInterval` doesn't wait for the async `tick` (`src/scheduler.js:26`). Each failing reminder spends about **3s** in backoff, one at a time. About **10** failing reminders push a tick past 30s. The next tick then reads the same `sent = 0` rows and sends them again.

**4. Smaller issues**
- A reminder that always fails is retried every tick, forever (`src/scheduler.js:18-21`).
- An invalid `at` makes `due_ms` `NaN`, so the reminder never fires and no error is raised.
- No auth: list and delete trust the `userId` and `id` in the request, and delete doesn't check who owns the reminder.
- A typo in `config.json`'s `formatter` isn't caught at startup. Every send then fails at runtime.

✗ **Tests not run:** `node --test` needed approval, which this session couldn't get. Bug 1 is confirmed by working through the code by hand, not by a test run.

⚠ **Risk:** bug 1 affects every user not on UTC **today**. Bug 2 becomes exploitable the day a real database replaces `src/db.js`.
❓ **Needs you:** should I fix bug 1 now (a 1-line change plus a test), or fold it into the persistence work?

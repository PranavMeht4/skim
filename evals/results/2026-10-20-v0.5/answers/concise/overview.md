This is a small Node 20 service (ES modules, no dependencies) that stores reminders and prints them when they're due. It has two paths through the code. Several real bugs are hidden because every test uses a UTC offset of 0. I couldn't run the tests (`node` needed permission I don't have in this session), so everything below comes from reading the code.

## How it works

- **Write path:** `api.js` `handle(req)` → `db.query`. It has routes to create, list, search and delete reminders. Requests and responses are plain objects, not HTTP.
- **Delivery path:** `index.js` reads `config.json` → `startScheduler` (`scheduler.js:25`) runs `tick` every 30s. `tick` selects unsent rows → `dueReminders` → `withRetry` (5 attempts, exponential backoff) → `notify.send`. `send` loads a formatter module by name from config and writes it to `console.log`.
- **`db.js`** is an in-memory stand-in for a SQL database. It parses only the few statements the service uses with regexes, and logs every query to `queryLog` so tests can inspect them.
- **Timestamps:** `at` is the user's local time, `tz_offset_min` is their offset (IST = 330), and `due_ms` is meant to be UTC (see the README table).

**README constraints any change must respect:** one process on one VM, under 5,000 reminders, must survive restarts, no new infrastructure, no dependencies.

## Known problems, most serious first

1. **The time-zone offset is applied twice.** `toUtcMs` (`api.js:8`) already stores `due_ms` as UTC, then `dueReminders` (`scheduler.js:9`) subtracts the offset again. Example: 09:00 IST is stored as 03:30Z but fires at 22:00Z the day before, which is 5.5h early. Users with negative offsets get theirs late. `scheduler.test.js` only uses offset 0, so the tests pass anyway.
2. **The API isn't connected to anything.** `index.js` only starts the scheduler, and there's no HTTP listener. Outside the tests nothing calls `handle`, so in production the scheduler checks an empty database.
3. **Nothing is saved.** `db.js` keeps rows in memory, so they're lost on restart. The README already admits this; it's the obvious next project.
4. **The search query is built by string concatenation** (`api.js:31`), and search has no tests. The fake database limits the damage today, but this becomes SQL injection once a real database replaces it. Also, there's no authentication anywhere: `userId` is whatever the caller sends, and delete (`api.js:35`) doesn't check who owns the reminder.
5. **Overlapping ticks can send the same reminder twice.** `setInterval` (`scheduler.js:26`) starts a new `tick` without waiting for the last one, and reminders are sent one at a time. Each reminder that keeps failing spends about 3s in backoff on every tick, with no limit across ticks. About 10 of them push a tick past 30s. The next tick then reads the same unsent rows and sends them again.
6. **The "old" message format is the one in use.** `config.json` and the default at `notify.js:14` both use `legacy`, even though the README calls `format.js` the current format. `legacy.js` has a TODO to remove it. Deleting it would break only at runtime, because formatters are loaded by name (`notify.js:8`): every send would fail and retry forever, and nothing would be delivered.
7. **Minor:** the retry jitter is ±500ms, which is larger than the 200ms base delay (`retry.js:8`). The tests set `Math.random` to remove it, so this isn't tested.

## Suggested reading order

`README.md` → `src/index.js` → `src/scheduler.js` → `src/notify.js` → `src/api.js` → `src/db.js`. Then `test/`, keeping in mind that all of it assumes UTC.

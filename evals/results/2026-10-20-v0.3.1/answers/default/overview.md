# reminder-service: overview for a new engineer

## The short version

It's a small Node 20 service with no dependencies. It stores reminders and is meant to deliver each one at the time the user picked. About 200 lines of code, one process, one small VM.

**The running process does nothing useful yet.** `src/index.js:6` only starts the scheduler. Nothing calls the request handler `handle()` in `src/api.js`: there's no HTTP server or other front end. The database is an in-memory array inside the process, so nothing can add a reminder. The scheduler checks an empty table every 30 seconds. So far the code only runs for real in the tests.

## How it runs

```
npm start    # node src/index.js: reads config.json, starts the scheduler
npm test     # node --test test/
```

I didn't run the tests because the command needed approval in this session. So I can't tell you whether they pass.

## How the pieces fit

```
api.handle(req) ──► db.query(sql) ◄── scheduler.tick() ──► retry.withRetry() ──► notify.send() ──► format.js / legacy.js ──► stdout
```

| File | Role |
|---|---|
| `src/index.js` | Entry point. Reads `config.json` and starts `setInterval(tick)`. |
| `src/api.js` | A plain function: `{method, path, query, body}` in, `{status, body}` out. Four routes: create, list, search, delete. |
| `src/db.js` | A fake SQL database. It uses regex to parse the few SQL statements the code sends and runs them against an in-memory array. It also logs every statement to `queryLog`, which the tests read. |
| `src/scheduler.js` | Each tick it loads unsent rows, filters the due ones, sends each with retry, then sets `sent = 1`. |
| `src/retry.js` | Exponential backoff with ±500 ms jitter. |
| `src/notify.js` | Loads the formatter module named in `config.json` (`import(\`./${name}.js\`)`) and writes the result to `out`, which defaults to `console.log`. "Delivery" means a line on stdout. |
| `src/format.js` / `src/legacy.js` | Two message formats: a readable sentence, and the old `REMIND\|user\|at\|text` pipe format. |

The app code already talks SQL. Swapping `db.js` for a real database should mostly leave `api.js` and `scheduler.js` alone. That matters for issue 2 below.

## Data model

Each reminder has `id, user_id, text, at, tz_offset_min, due_ms, sent`.

- `at` is the local time the user picked, as `YYYY-MM-DDTHH:mm`.
- `tz_offset_min` is the user's UTC offset in minutes, east positive (IST is 330).
- `due_ms` is the same moment as a **UTC** epoch in ms, worked out once at creation by `toUtcMs` (`src/api.js:7`).

The offset is fixed when the reminder is created, so daylight-saving changes after that aren't handled.

## Config

`config.json` has `tickSeconds` (30) and `formatter`. The formatter is set to `"legacy"`, not `"format"`.

## Tests

The tests in `test/` cover `toUtcMs`, create/list/delete, `dueReminders` (only with offset 0), `withRetry` (jitter turned off by stubbing `Math.random`) and `send` (with the `format` formatter). Nothing tests search, `tick()`, overlapping ticks or the legacy formatter.

## Bugs, most serious first

1. **The timezone is applied twice. Reminders fire at the wrong time for anyone not on UTC.**
   - `src/api.js:8` already turns local time into UTC for `due_ms`. Then `src/scheduler.js:9` subtracts the offset again.
   - Result: IST reminders fire 5.5 hours early, and UTC−5 reminders fire 5 hours late.
   - The comment at `src/scheduler.js:7` ("due_ms is the user's wall-clock time") is wrong. The README, `toUtcMs` and its test all say `due_ms` is UTC, so fix the scheduler, not the API.
   - The tests miss it because every scheduler and create test uses offset 0.

2. **Search builds its SQL by gluing strings together** (`src/api.js:30-31`).
   - **Today:** the fake database splits conditions on the word "AND" (`src/db.js:29`). A normal search like `q=salt and pepper` is split in the middle of the text. The parser then throws "unsupported condition", and `handle()` doesn't catch it.
   - **Later:** once a real database replaces `db.js`, which is the next planned job, this becomes a real SQL injection hole. Switch to `?` parameters like the other routes use.

3. **Ticks can overlap and send the same reminder twice** (`src/scheduler.js:25-26`).
   - `setInterval` starts a new tick every 30 seconds whether or not the last one has finished.
   - A reminder that keeps failing takes about 3 seconds (5 attempts with backoff), and reminders are sent one at a time. About 10 failing reminders push a tick past 30 seconds.
   - The next tick then reads the same unsent rows and sends them again.
   - Fix: skip a tick while the previous one is still running, or use a `setTimeout` chain.

4. **The live message format is the "legacy" one.**
   - `config.json:3` selects `legacy`, even though the README calls `format.js` "current" and `legacy.js` has a "remove this" TODO.
   - If someone deletes `legacy.js`, startup still succeeds. Every send then fails inside the retry loop and gets logged again on every tick, forever.
   - Switch the config first, or check the formatter name at startup.

## Smaller issues

- `queryLog` (`src/db.js:8`) keeps every statement and is never cleared outside tests, so memory grows for as long as the process runs.
- A badly formatted `at` makes `due_ms` NaN. The reminder is stored but never fires, with no error.
- Jitter is a fixed ±500 ms, larger than the 200 ms first delay, so that delay can come out negative.
- If the first query in `tick()` throws, the promise rejection isn't handled, and that crashes Node 20.
- A reminder that always fails is retried every tick forever. There's no limit on attempts and no place to park failed ones.
- Delete doesn't check who owns the reminder, and there's no auth anywhere.
- `listReminders` crashes if `query` is missing from the request.

## What's next: persistence

The README's main open item is that reminders must survive a restart. Its limits are Node 20, no dependencies, no new infrastructure, one process, and fewer than 5,000 rows.

- Node's built-in `node:sqlite` doesn't exist in Node 20. As far as I know it arrived in Node 22.
- On Node 20, the simplest fit is a JSON file, written to a temp file and then renamed over the old one so a crash can't corrupt it. 5,000 rows is small enough.
- Node 20 also reached end-of-life in April 2026. Upgrading to a current LTS is worth raising, and it would make SQLite an option. I didn't check either date in this session.

## Where to start

1. Fix bug 1 and add a scheduler test with a non-zero offset.
2. Parameterise search (bug 2).
3. Add the overlap guard (bug 3).
4. Then do persistence and wire `handle()` to an HTTP server, so the service actually takes reminders.

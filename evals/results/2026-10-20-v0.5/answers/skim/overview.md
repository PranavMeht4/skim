**This is a small (~350-line) Node 20 reminder service with no dependencies. It is not production-ready: there's no HTTP server, all data is lost on restart, and a timezone bug fires reminders at the wrong time.**

1. **Reminders fire at the wrong time** for any non-zero offset. `api.js:8` already stores `due_ms` as UTC, as `README.md:37` says. Then `scheduler.js:9` subtracts the offset again. IST fires **5h30m early** and UTC−5 fires **5h late**. Fix: drop the subtraction in the scheduler.
2. **The API is never served.** `index.js` only starts the scheduler, and only the tests import `handle`. `npm start` polls an empty in-memory table.
3. **No persistence.** `db.js` is an in-memory fake, so rows are lost on restart. The README calls this a requirement that isn't met yet (`README.md:16`).
4. **SQL built by string concatenation** in search (`api.js:31`). Today a search for "salt **and** pepper" throws (`db.js:18`), and nothing catches it. Once `db.js` becomes real SQL, this is **injection**.
5. **No auth.** Any caller can list or search any `userId`. Delete never checks who owns the reminder (`api.js:35-38`).
6. **The legacy format is live.** `config.json:3` sets `"formatter": "legacy"`, even though `legacy.js` has a "remove me" TODO.
7. **I could not run the tests**, because the command wasn't approved. Everything here comes from reading the code.

## How it fits together
```flow
index.js -> config.json (tickSeconds: 30, formatter)
index.js -> scheduler.js startScheduler -> setInterval(tick)
tick -> db.js SELECT sent = 0 -> dueReminders -> retry.js withRetry(5 attempts) -> notify.js send -> legacy.js | format.js -> console.log
tick -> db.js UPDATE sent = 1
api.js handle -> db.js (tests only, no server wires it up)
```

| File | Role |
|---|---|
| `src/api.js` | `handle({method, path, query, body})`: create, list, search, delete |
| `src/db.js` | Fake SQL with regex parsing. It only supports `col = ?`/`LIKE` joined by `AND`. `queryLog` lets tests see what ran |
| `src/scheduler.js` | Each tick: picks due, unsent rows, sends each one in turn, marks it sent. A failed send stays unsent and is tried again next tick |
| `src/notify.js` | Picks the formatter by name at runtime (`import(\`./${name}.js\`)`) and caches it |
| `src/retry.js` | Exponential backoff: 200ms base, 10s cap, ±500ms jitter |

## Deployment limits (from the README)
- **One process** on one VM, with **no plan** for a second.
- About **2,000 reminders** today, expected to stay **under 5,000**.
- **No new infrastructure** (no DB server, no queue). That bounds the persistence fix: a local file or embedded store.

## Why the tests miss the timezone bug
- `api.test.js` creates reminders at the default offset of **0**, and `scheduler.test.js` hardcodes `tz_offset_min: 0`. Each half is only tested alone at offset 0.
- There are **no tests** for `tick`, search, the legacy formatter, or overlapping ticks. `retry.test.js` fixes jitter at 0.

**Also:**
- **Ticks can overlap.** `setInterval` doesn't wait for the async `tick` to finish (`scheduler.js:26`). Each failing send spends about 3s in backoff, one after another, so about 10 failing reminders run a tick past 30s. The next tick then re-selects the same unsent rows and sends **duplicates**. This is harmless while delivery is just `console.log`, but becomes real once delivery does I/O.
- **An invalid `at` value** gives `due_ms = NaN`. It's stored, and that reminder **silently never fires**, because `at` isn't validated.
- **A typo in the `formatter` name** in config makes every send fail. Each reminder is then retried 5 times per tick, forever, with only a log line.
- **Jitter (±500ms) is larger than the base delay (200ms)**, so the first retry can come almost instantly.
- **`GET /reminders` with no `query`** throws a `TypeError` on `q.userId` (`api.js:25`).
- **Confusing name:** the "current" formatter is called `format`, not something like `default`.

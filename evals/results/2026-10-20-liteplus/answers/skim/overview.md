**A Node 20 reminder service with no dependencies. Only the scheduler loop actually runs, and it has a timezone bug that sends reminders at the wrong time.**

1. **The API is not reachable.** `src/index.js:6` only starts the scheduler. Nothing calls `handle()` (`src/api.js:41`) except the tests, and there is **no HTTP server**. Because storage is in memory, a running process **never has any reminders**.
2. **Storage is in memory** (`src/db.js:4`), so everything is **lost on restart**. README:16 says this must change, and README:17 rules out **new infrastructure**.
3. **Timezone bug** at `src/scheduler.js:9`: it subtracts the offset a **second time**, but `due_ms` is already UTC (`api.js:8`, README:37). IST reminders fire **5.5h early** and UTC−5 reminders fire **5h late**. The fix is `r.due_ms <= nowMs`. The tests only use offset 0, so they miss it.
4. **Search builds SQL by string concatenation** (`api.js:31`), so it is open to **injection**. With the fake DB, any search term containing " and " throws `unsupported condition`. Switching to `?` params fixes both, and the fake DB already supports `LIKE ?`.
5. **Production uses the legacy pipe format:** `config.json:3` selects it, and `notify.js:14` defaults to it. `format.js` is used **only in tests**. If you delete `legacy.js` (as its TODO says) without changing **both** places, every send fails on every tick, forever.
6. **I didn't run the tests** because the command needed approval. There are **11 tests**, counted by reading the files; there is no search test.

## How a reminder flows

```
config.json (tickSeconds: 30, formatter: "legacy")
   └─ index.js → startScheduler → setInterval(tick, 30s)      # tick is not awaited
        └─ tick: SELECT * WHERE sent = 0
             └─ dueReminders(rows, now)                        # the TZ bug is here
                  └─ withRetry(send, 5 attempts, exp backoff)
                       └─ notify.send → dynamic import ./<formatter>.js → console.log
                            └─ UPDATE sent = 1                 # on failure, retried next tick
```

Worked example for IST: `at` = 09:00 with offset 330 gives `due_ms` = 03:30Z. The scheduler then subtracts 5.5h again and fires at **22:00Z the previous day**.

"Delivery" is just `console.log`. There is no real channel yet.

## Layout

| File | Role |
|---|---|
| `src/index.js` | Entry point. Reads `config.json` and starts the scheduler |
| `src/api.js` | `handle({method, path, query, body})` for create, list, search and delete |
| `src/db.js` | Fake SQL. It parses only the statements the service uses, and logs them to `queryLog` for the tests |
| `src/scheduler.js` | `dueReminders` and `tick` |
| `src/retry.js` | `withRetry` with exponential backoff and ±500ms jitter |
| `src/notify.js` | Loads the formatter by name, then outputs the message |
| `src/format.js` / `src/legacy.js` | Current format and old pipe-delimited format |

**Reminder fields:** `id`, `user_id`, `text`, `at` (local `YYYY-MM-DDTHH:mm`), `tz_offset_min` (east positive, IST = 330), `due_ms` (UTC epoch ms), `sent` (0/1).

**Run:** `npm start` starts the scheduler; `npm test` runs `node --test test/`.

**Deployment constraints (README):** **one process** on one VM, about 2,000 reminders now and under 5,000 expected, must survive restarts, and no database server or queue. Persistence is the main open work. Note that `node:sqlite` is **not** in Node 20, so a JSON file written atomically (temp file, then rename) fits these constraints.

**Also:**
- **Ticks can overlap (latent).** `setInterval` doesn't await `tick`, so a tick running past 30s overlaps the next one and can **double-send**. That only becomes real once `send` can fail or slow down. With one process, an in-process `running` flag is enough.
- **`at` is never validated.** A malformed value gives a `NaN` `due_ms`, and that reminder **silently never fires**. A value with seconds (`09:00:00`) very likely does the same via `${at}:00Z` (not run).
- **Retry delay can go negative** on the first retries (`retry.js:8`): 200ms ± 500ms. The tests pin `Math.random` to 0.5, so jitter is never tested.
- **No authorization.** `userId` comes from the query string, and delete (`api.js:35`) doesn't check ownership.
- **List crashes without a query:** if `query` is missing, `q.userId` throws a TypeError (`api.js:25`).
- **The formatter module path comes from config** (`notify.js:8`), so whoever controls config controls what gets imported.

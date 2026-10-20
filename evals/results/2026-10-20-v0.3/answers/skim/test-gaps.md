**6 gaps.** The worst hides a live bug: **non-UTC reminders fire at the wrong time.**
**Not run:** `node --test` needed approval, so I didn't run the suite. Everything here comes from reading the code, and I traced bugs 1–3 by hand.

1. **Timezone (live bug).** `scheduler.js:9` subtracts the offset a second time, after `api.js:8` already did. IST fires **5.5h early**, US-Eastern **5h late**. Tests miss it because `scheduler.test.js:6` sets `tz_offset_min: 0`.
2. **Search has no tests and crashes today.** `api.js:31` builds SQL by string concatenation. Searching "milk and eggs" throws out of `handle()`.
3. **Bad `at` is accepted.** `"2026-03-01T09:00:00"` becomes NaN `due_ms`. It still returns **201** and never fires (`api.js:13`).
4. **The production formatter has no tests.** `config.json:3` uses `legacy`, but the only test uses `format` (`notify.test.js:8`).
5. **`tick()` has no tests.** Nothing checks that `sent = 1` is written, the failure path, or overlapping ticks (`scheduler.js:12-27`).
6. Low: `backoffDelay` is never tested, and the tests turn jitter off (`retry.test.js:6`).

**1. Timezone.** README:37 says `due_ms` is already UTC, so the scheduler is the side that's wrong (its comment at `scheduler.js:7` is wrong too).
- Trace: 09:00 IST is stored as 03:30Z. The scheduler then compares against 22:00Z the previous day, so the reminder fires at 03:30 IST.
- Test to add: create through `handle()` with `tzOffsetMin: 330`. Run `dueReminders` on the stored row at 03:29Z (expect 0) and 03:30Z (expect 1).
- Fix: `r.due_ms <= nowMs`. Stored rows are already correct, so no data migration is needed.

**2. Search.** `db.js:29` splits the WHERE clause on `/\s+AND\s+/i`. So "milk and eggs" produces the condition `text LIKE '%milk`, which throws `unsupported condition`. `handle()` has no try/catch.
- Injection: the stub's parser returns nothing for `x' OR '1'='1`, so a behavior test would pass. Once `db.js` becomes a real database (README:16 requires surviving restarts), that payload would return every user's reminders.
- Test to add: `queryLog` (`db.js:8`) was built for this and no test uses it. Assert that the search SQL uses `?` and user input appears only in `params`. Also assert that "milk and eggs" returns 200.

**3. Validation.** `api.js:13` only checks that fields are present.
- Seconds in `at` give `...T09:00:00:00Z`, which parses to NaN. `NaN <= now` is false forever. `tzOffsetMin: "IST"` fails the same way.
- Test to add: a bad `at` should return 400.

**4. Legacy formatter.** `legacy.js:2` has a TODO to delete it. But `config.json:3` and the default at `notify.js:14` both still pick it.
- If someone deletes it as the TODO says, **every production send** fails in `import()` and is only logged. No test would fail, because `tick` is untested too.
- A `|` in the reminder text also corrupts the pipe-delimited output.
- Tests to add: `send` with `formatter: 'legacy'`, and a check that the formatter named in config loads.

**5. `tick()`.** Delivery is `console.log` today, so sends rarely fail or run slow. The overlap problem only bites once real delivery exists.
- Overlap: `setInterval` (`scheduler.js:26`) doesn't wait for the previous tick. Each failing reminder takes about 3s of retries, so about 10 failures push a tick past 30s. The next tick then selects the same unsent rows and sends them again.
- The SELECT at `scheduler.js:13` is outside the try, and the promise is dropped. With a real database, one query error becomes an unhandled rejection, which **exits the process** on Node 20.
- Tests to add: tick marks reminders sent; a failing send stays unsent; two concurrent ticks send each reminder once.

**6. Backoff.** Jitter is a fixed ±500ms (`retry.js:4,8`). That makes the first delay as low as −300ms and lets delays exceed `maxDelayMs` by up to 500ms. This matters little with one process.

| File | Tested | Not tested |
|---|---|---|
| `api.js` | toUtcMs, create (offset 0), list, delete | search, validation, 404 route |
| `scheduler.js` | dueReminders (offset 0) | tick, startScheduler |
| `notify.js` | send with `format` | `legacy`, bad formatter name |
| `retry.js` | withRetry | backoffDelay |
| `index.js`, `legacy.js` | nothing | everything |

**Also:**
- Delete has no ownership check (`api.js:35-38`), so any caller can delete any id. There's no auth model to test this against yet.
- Restarts lose all data (README:16 already says so), and no test covers it.
- `tz_offset_min` is captured when the reminder is created. A reminder that crosses a DST change fires 1h off. IST has no DST.

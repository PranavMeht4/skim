**6 gaps. The worst hides a live bug: reminders fire 5h30 early in IST.**
1. **Timezone double-shift** at `scheduler.js:9`. Every user outside UTC gets the wrong time today. Both tests use offset 0, so neither can catch it.
2. **Search has zero tests.** The SQL in `api.js:31` is built from strings. It crashes on "bread and milk" today, and it becomes SQL injection once a real database lands.
3. **A bad `at` returns 201 and the reminder never fires** (`api.js:16`). `due_ms` becomes `NaN`, and no test sends malformed input.
4. **`tick()` and `startScheduler()` have zero tests** (`scheduler.js:12-27`): marking sent, the failure path, overlapping ticks. The overlap risk is latent today.
5. **The formatter used in production is untested.** `config.json:3` uses `legacy`, but `notify.test.js:8` only tests `format`.
6. Retry jitter and the delay cap are untested (`retry.js:6-10`). Low impact.

I did **not run the tests** because node commands need approval in this session. These results come from reading all 11 files.

**1. Timezone.** `README.md:37` says `due_ms` is already UTC, and `toUtcMs` gets it right. The scheduler then subtracts the offset a second time:
```
create 09:00, tzOffsetMin 330 (IST)
api.js:16       due_ms = 03:30Z                 correct
scheduler.js:9  03:30Z - 5h30 = 22:00Z, Feb 28  fires 03:30 IST, 5h30 early
```
With offset −300 (EST), reminders fire **5h late**.
- **Fix:** compare `r.due_ms <= nowMs`, and correct the comment at `scheduler.js:7`.
- **Test:** do a round trip. Create the reminder through `handle()` with offset 330, then assert it is not due at 03:29Z and is due at 03:30Z. A test of the scheduler alone would just encode whatever its author assumed.

**2. Search.** `db.js:29` splits conditions on ` AND ` in the SQL text. So the query `bread and milk` turns one condition into `text LIKE '%bread`, which throws `unsupported condition: text LIKE '%bread`. Nothing catches it.
- **Fix:** use `WHERE user_id = ? AND text LIKE ?` with the parameters `[q.userId, `%${q.q}%`]`. This also fixes the crash, because the split runs on the SQL text, not on the parameters.
- **Tests:** a normal hit, `and` inside the query, and a quote inside `userId`.

**3. Malformed input.** If `at` includes seconds (`2026-03-01T09:00:00`) or is free text like `tomorrow`, `due_ms` comes out as `NaN`. The same happens with a `tzOffsetMin` like `"+05:30"`. The API still returns 201, but `NaN <= now` is always false, so the reminder silently never fires.
- **Fix:** return 400 when `Number.isNaN(dueMs)`.

**4. `tick()`.** No test checks that a successful send sets `sent = 1`, or that a failed send stays unsent.
- **Overlap risk:** `setInterval` at `scheduler.js:26` doesn't wait for the previous tick to finish. Each failing send spends about 3s in backoff (200+400+800+1600 ms). About 10 failures push a tick past 30s. The next tick then re-reads the same `sent = 0` rows, so a flaky delivery channel would send some reminders twice.
- **Retry forever:** a reminder that always fails is retried on every tick, with no limit.
- **Why it's latent:** `out` is `console.log` today, so none of this can happen yet.
- **Fix:** add an in-flight guard in `startScheduler` that skips a tick while one is running. It's one process, so no lock is needed.
- **Testing is easy:** `tick(now, { out })` accepts a fake sender.

**5. Formatter.** `legacy` is also the default at `notify.js:14`. Three things are untested:
- the `legacy` output format
- a `|` in reminder text, which breaks the pipe-delimited format
- a typo in the formatter name. The import fails, so every reminder fails 5 retries on every tick. Meanwhile `index.js` still logs "scheduler running".

**6. Retry.** The tests pin `Math.random` to 0.5, so jitter is always 0. Real jitter is ±500 ms around a 200 ms base, so the first retry delay can range from −300 to 700 ms. Results are still correct, but retries are spread out less than the comment says.

**Skip:** direct tests for `db.js`, which is a stand-in that will be replaced. Test it through `api.js` so those tests survive the swap. The same goes for `index.js`.

**Also:** there is no auth. Any caller can list any `userId` or delete any id (`api.js:35`). And reminders still don't survive a restart, which the README requires.

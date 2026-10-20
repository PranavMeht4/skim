The biggest gap isn't a missing test. It's a weak one. `dueReminders` has tests, but they only use `tz_offset_min: 0`, which hides a bug that makes every non-UTC reminder fire at the wrong time. Here are the gaps, ranked by what a realistic test would catch today:

1. **The timezone offset is applied twice (`src/scheduler.js:9`).** `due_ms` is already UTC (`toUtcMs` at `src/api.js:16`, and the README says so). `dueReminders` then subtracts the offset again.
   - A 09:00 IST reminder (offset 330) is stored as 03:30Z but fires at 22:00Z the day before, 5.5h early.
   - US users get theirs late: 5h late for EST.
   - Both test files pass because each checks only its own side, at offset 0.
   - **Missing test:** create a reminder through `handle` with `tzOffsetMin: 330`. `dueReminders` should return nothing at 03:29Z and one reminder at 03:30Z.

2. **Search has zero tests and builds SQL by joining strings (`src/api.js:30-31`).**
   - Searching "bread and milk" throws today. The fake DB splits on `AND` and can't parse the leftover `text LIKE '%bread`.
   - Once `db.js` becomes a real store (the README requires surviving restarts), it's SQL injection: `userId=x' OR '1'='1` returns every user's reminders.
   - `db.queryLog` exists for exactly this kind of check, but no test uses it.
   - **Missing tests:** search text containing "and" or an apostrophe, plus a check that the values arrive in `params`.

3. **`tick()` and `startScheduler` have no tests (`src/scheduler.js:12-27`).**
   - Nothing checks that a successful send marks the row sent, or that a failed send stays unsent for the next tick.
   - **Duplicate sends:** `setInterval` doesn't wait for the async `tick`. Each failing reminder spends about 3s in backoff (5 attempts), so about 10 failures push a tick past 30s. The next tick then re-reads rows that aren't marked yet and sends them a second time. Running a single process doesn't prevent this.

4. **The formatter production actually uses is untested.** `config.json` and `send`'s default both use `legacy`, but the only notify test uses `format`. A typo in the formatter name makes every send fail, retry 5 times and log an error each tick. Delivery stops, and no test or startup check catches it.

5. **A malformed `at` is accepted (`src/api.js:16`).** A value with seconds (`2026-03-01T09:00:00`) or plain garbage gives `due_ms = NaN`. The API still returns 201, and the reminder never fires. Only missing-field validation is tested.

**Lower priority:**
- The retry tests pin `Math.random` to 0.5, so jitter never runs. The fixed ±500ms on a 200ms base can go negative, which is harmless because `setTimeout` treats it as 0.
- `index.js` is untested.
- Delete doesn't check who owns the reminder, though there's no auth yet.
- Nothing tests surviving a restart, but that feature doesn't exist yet.

Running the suite needed your approval, so I didn't run it. These findings come from reading the code and tracing it by hand. I can write the tests for items 1–3; I expect those for 1 and 2 to fail against the current code.

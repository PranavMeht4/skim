**The worst gap is that no test runs a reminder with a non-zero timezone from creation through to scheduling, and that hides a live bug: reminders for anyone outside UTC fire at the wrong time.**

This comes from reading the code only. Bash was denied, so **I didn't run the tests or measure coverage**.

Ranked by damage:

1. **The timezone offset is applied twice** (`scheduler.js:9`).
   - `api.js:8` already converts local time to UTC, which matches `README.md:37`. `scheduler.js:9` then subtracts `tz_offset_min` again; its comment at `:7` assumes the opposite.
   - A 09:00 IST reminder is stored as 03:30Z, but the scheduler fires it at **22:00Z the day before, 5.5h early**. US Eastern (−300) fires **5h late**.
   - The tests miss it because `scheduler.test.js:6` pins `tz_offset_min: 0` and `api.test.js:17` uses the default offset of 0.
   - Test to add: create a reminder with `tzOffsetMin: 330`, then check that `dueReminders` returns 0 at 03:29Z and 1 at 03:30Z. **It would fail today.**
2. **The search route has no tests, and its SQL is built by joining strings** (`api.js:31`).
   - Today, searching **"milk and eggs"** throws `unsupported condition`, because `db.js:29` splits the query on `AND`. The error escapes `handle` and nothing turns it into a 500.
   - Once `db.js` is replaced with real storage, which `README.md:16` requires, this becomes **SQL injection** and other users' reminders become readable.
   - `queryLog` (`db.js:8`) exists for exactly this kind of check, but **no test uses it**.
3. **`tick()` and `startScheduler` have no tests** (`scheduler.js:12-27`).
   - Nothing checks that a reminder is marked sent only after it is delivered, that a failed one stays unsent, or the `attempts: 5` retry path.
   - **Double sends are possible (worked out on paper, not reproduced):**
     - Each failing reminder waits about 3s across its retries (200+400+800+1600ms), and reminders are sent one at a time.
     - About 10 failures push one run past the 30s interval.
     - `setInterval` doesn't wait for the previous run, so the next run picks up the same unsent rows and sends them again.
   - A reminder that always fails is **retried forever**, on every run.
4. **The formatter used in production is untested.** `config.json:3` selects `legacy`, but `notify.test.js:8` only tests `format`.
   - A `|` in the reminder text breaks the pipe-delimited line (`legacy.js:4`).
   - A misspelled formatter name makes **every send fail, every time**, instead of failing at startup (`notify.js:8`).
5. **A malformed `at` time is accepted and the reminder never fires** (`api.js:13-16`).
   - `"2026-03-01T09:00:00"` (with seconds) produces `due_ms` = NaN, yet the API returns **201**. `NaN <= now` is always false, so the reminder is never due. No test checks input validation.

**Also:**
- Jitter is never tested, because `retry.test.js:6` fixes `Math.random` at 0.5. Jitter is a fixed ±500ms, so the first retry delay can be **negative** and the cap `maxDelayMs` can be exceeded (`retry.js:7-8`).
- `DELETE` doesn't check who owns the reminder (`api.js:35-38`), and no test covers it.
- A fixed `tz_offset_min` goes wrong across daylight-saving changes.
- Surviving restarts (`README.md:16`) is a missing feature rather than a test gap, since `db.js` keeps everything in memory.
- `GET /reminders` with no `query` object throws (`api.js:25`).

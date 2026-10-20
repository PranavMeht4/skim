Your 9 tests cover the easy paths. The three things most likely to hurt users have no tests at all: the code that actually sends reminders, the search route, and anything with a timezone other than UTC.

I couldn't run anything because `node` needed approval, so this comes from reading all 351 lines. The test cases below are worked out by hand and haven't been run.

## Why passing tests prove little here

Each test avoids the setup production actually uses:
- **Scheduler tests** use only `tz_offset_min: 0`, so any mistake in timezone handling cancels out.
- **The notify test** uses the `'format'` formatter, but production uses `'legacy'` (`config.json` and the default in `notify.js:14`).
- **The retry tests** fix `Math.random` at 0.5, so the random part of the retry delay is never tested.
- **Nothing tests across modules.** No test creates a reminder through the API and then checks when the scheduler sends it.

## Ranked by what matters

**1. Reminders fire at the wrong time for every user outside UTC.**
- The reminder time is converted to UTC when it's saved (`src/api.js:8`), then converted again when checking if it's due (`src/scheduler.js:9`).
- An IST user who sets 09:00 gets the reminder at 03:30 IST, 5.5 hours early. US users get theirs hours late.
- The scheduler is the side to fix. The README, `toUtcMs` and its test all agree the saved time is already UTC, and the comment at `scheduler.js:7` is out of date.
- Test that fails today: create `{at:'2026-03-01T09:00', tzOffsetMin:330}`, then check that `dueReminders(rows, Date.parse('2026-03-01T03:29:59Z'))` returns no reminders. It returns one.

**2. The search route has no tests, and it's the only query built by pasting user input into SQL (`src/api.js:30-31`).**
- **Today:** searching for `'milk and eggs'` makes `handle()` throw. The in-memory database splits the query on `AND`, including the `and` inside the search text.
- **After the move to a real database** (the README's open item, since data must survive restarts): this is SQL injection, and an apostrophe in a search becomes a syntax error.
- The right test sends a request through `handle()` and checks `queryLog`. The user's text should be passed as a parameter, never pasted into the SQL. `db.js:7` says `queryLog` exists for exactly this, but no test uses it. A test like that will still work after the database is replaced.

**3. The code that actually sends reminders (`tick()`) is untested.**
- `legacy.js` says "TODO: remove" and nothing imports it directly, only by name from config. Deleting it would leave every test passing and stop all deliveries without any visible error. Each send would fail, retry five times, log a line, and repeat every tick.
- Nothing checks that a reminder is marked sent and not sent again on the next tick.
- This is probably why `tick()` has no tests: it hardcodes `{ attempts: 5 }` and doesn't let callers change the retry settings (`scheduler.js:16`). Any test where a send fails would wait about 3 seconds of real retry delay. Letting callers pass the retry settings in, or using `mock.timers`, would make those tests easy to write.

**4. Medium priority**
- **Bad input is accepted and then never fires.** For example `tzOffsetMin: '+05:30'`, or an `at` that isn't a valid date: the saved time becomes `NaN`, the API returns 201, and the reminder is never due.
- **Missing query crashes.** A GET to `/reminders` or `/reminders/search` with no query object throws a TypeError at `q.userId`.
- **Duplicate sends.** `setInterval` doesn't wait for the previous tick to finish. If sends are slow or failing (about 10 failing reminders in one tick is enough), two ticks run at once and both send the same reminders. This only shows up once sending goes over a real network.

**5. Low priority**
- The random part of the retry delay is fixed at ±500 ms, so the delay can be negative on the first attempt or go over the 10-second cap.
- `index.js` and loading `config.json` are untested.
- Anyone can list or delete any user's reminders. That's a missing permission check in the design rather than a test gap.

**Question:** the README calls `format.js` the "current message format", but production uses `legacy`. Is that on purpose?

**Suggested order:** since moving to a real database is the next change, start with tests that go through `handle()` and `tick()` and check results via `queryLog`. They'll keep working when `db.js` is rewritten. If you allow `node` to run, I can add the three failing tests (items 1–3) and confirm they fail for the reasons above.

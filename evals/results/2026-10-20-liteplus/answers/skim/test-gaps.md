**The biggest gap: no test uses a non-zero timezone, and that hides a live bug where every non-UTC reminder fires at the wrong time.** I only read the code. `node --test` and `npm test` both needed approval, so no tests ran and I have no coverage numbers.

1. **Timezone is shifted twice and never tested.** `api.js:8` already converts to UTC, then `scheduler.js:9` subtracts the offset again. IST reminders fire **5.5h early** and US Eastern ones **5h late**. Every test uses offset 0 (`scheduler.test.js:6`, `api.test.js:17`).
2. **`tick()` and `startScheduler` have zero tests.** `setInterval` doesn't wait for a tick to finish, and `tick` never re-checks `sent`. So any tick over 30s **sends the same reminders twice** (`scheduler.js:26`).
3. **Search has zero tests and builds SQL by string concatenation** (`api.js:31`). Today a search for "bread and milk" throws `unsupported condition: text LIKE '%bread`. Against a real database it's **SQL injection**.
4. **The format that actually ships is untested.** `config.json:3` and `notify.js:14` use `legacy`, but the only test of `send` uses `format` (`notify.test.js:8`). Deleting `legacy.js`, as its TODO suggests, would make **every send fail** with no test catching it.
5. **An invalid `at` is accepted** (`api.js:13`). `at: "9am"` returns 201 with `due_ms` = NaN, and the reminder **never fires, with no error**.
6. **`db.js` has no tests of its own**, yet the README requires surviving restarts (`README.md:16`), so it has to be swapped out. That swap has no safety net.

## Tests to add, in priority order

| # | Test | Fix it exposes |
|---|---|---|
| 1 | Create at `09:00` with offset 330, then `dueReminders` is due at `03:30Z` and not at `03:29Z` | `r.due_ms <= nowMs` in `scheduler.js:9` |
| 2 | Two concurrent `tick()` calls send each reminder once; a failed send stays unsent; a successful one is marked sent | Guard against overlapping ticks, or re-check `sent` before sending |
| 3 | Search terms containing `'` and ` and ` | Use `?` parameters, like `listReminders` does |
| 4 | `send` with `legacy`, and with an unknown formatter name | Test the formatter that's actually configured |
| 5 | `at: "9am"` returns 400 | Reject when `Number.isNaN(dueMs)` |
| 6 | A set of `db.js` tests (insert, select, LIKE, update, delete) that the new store must also pass | Lets you switch to a file-backed store safely |

## Why this order
- **#1 and #2 are on the live path.** `index.js` only starts the scheduler. Nothing in `src/` calls `handle()`, so how much #3 and #5 matter depends on whatever outside caller uses the API.
- **#1 is certain:** the scheduler's comment says `due_ms` is wall-clock time, but the README says it's UTC. The tests for each half pass on their own because both use offset 0.
- **#2 is a risk, not a live bug yet.** `send` is just `console.log` today. But `tick` works on copied rows (`db.js:51`), so a backlog after downtime or slow real delivery would send duplicates. Each failing reminder also spends about 3s retrying (5 attempts: 200+400+800+1600ms), so 10 failures already exceed the 30s tick.
- **#3 becomes injection with the persistence work.** Against today's in-memory stand-in it only crashes, because it can only AND conditions together.

**Also:**
- **The random jitter in retries is never tested.** The retry tests fix `Math.random` at 0.5 (`retry.test.js:6`). The ±500ms jitter is bigger than the 200ms base delay, so early delays can come out negative, and the cap can be exceeded by up to 500ms (`retry.js:8`).
- **A reminder whose send always fails is retried forever**, about 3s every tick, with no attempt limit and no test.
- **Delete doesn't check who owns the reminder** (`api.js:35`). Any caller can delete any id, and no test covers it.
- **`queryLog` is never used by any test**, even though its comment in `db.js:7` says tests use it.
- **DST:** a single fixed `tz_offset_min` puts users in DST zones 1h off after a clock change. That's a design limit, not a test gap, and IST has no DST.
- **Unhandled rejection:** an error thrown by `tick()` inside `setInterval` would crash the Node 20 process. That becomes possible once reading from a real store can fail.

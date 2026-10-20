**The gap that matters most: no test uses a non-zero timezone offset, and that hides a real delivery-time bug.** I couldn't run the suite (approval was denied), so everything below comes from reading the code.

1. **The timezone is applied twice** (`scheduler.js:9`). IST users get reminders **5.5h early** and US-Eastern users **5h late**. The only scheduler test fixture uses `tz_offset_min: 0` (`scheduler.test.js:6`).
2. **`/reminders/search` has zero tests.** Searching `"milk and eggs"` **throws**. It also builds SQL by **string concatenation** (`api.js:31`).
3. **`tick()` has zero tests.** Overlapping ticks can **send a reminder twice**, and a reminder that always fails is retried **forever** (`scheduler.js:12-27`).
4. **The formatter that runs in production is untested.** `config.json` and `send`'s default both use `legacy`, but the test covers only `format` (`notify.test.js:8`).
5. **There are no input-validation tests.** A malformed `at` makes `due_ms` `NaN`, so the reminder is accepted and then **never fires**.

## 1. Timezone applied twice
```flow
api.js:8 toUtcMs: 09:00 IST -> due_ms = 03:30Z (already UTC, per README.md:37)
scheduler.js:9 subtracts tz_offset_min again -> fires at 22:00Z the day before = 03:30 IST
```
- With offset 0 the bug has no effect, so every current test passes. The bug sits between two modules that are each tested only on their own.
- **Missing test:** create a reminder with `tzOffsetMin: 330`, `at: '…T09:00'`. Then check `dueReminders` returns nothing at 03:29Z and returns it at 03:30Z.
- **Fix:** remove `- r.tz_offset_min * 60_000` at `scheduler.js:9`, and correct the comment on line 7.

## 2. Search: no tests at all
- The search builds `… AND text LIKE '%milk and eggs%'`. `db.js:29` splits it on `AND`, which leaves `text LIKE '%milk`. `matcher` then throws `unsupported condition`, and `handle` doesn't catch it.
- The string-built SQL becomes **real injection** once a real database replaces the stand-in, which `README.md:16` says is needed.
- **Missing tests:** a search term containing "and", an apostrophe (`mum's`), and a `'` in `userId`.

## 3. `tick()`: only the pure filter is tested
- Each failing reminder spends about **3s** in backoff (5 attempts, run one after another). About **10 failing reminders** fill the 30s interval.
- `setInterval` doesn't wait for the previous tick to finish. The overlapping tick reads the same `sent = 0` rows, so those reminders go out **twice**.
- There's no cap on retries across ticks and no dead-letter handling.
- **Missing tests:**
  - A successful send marks the reminder `sent`.
  - A failed send leaves it unsent.
  - Two concurrent `tick()` calls send each reminder once.

## 4. Legacy formatter
- `legacy.js:2` says *"TODO: remove"*. Deleting that file would break production while the tests stay green.
- A `|` in the reminder text corrupts the pipe-delimited output.
- No test checks what happens when the formatter name is unknown.

## 5. Input validation
- An `at` value with seconds (`2026-03-01T09:00:00`) becomes `…:00:00Z`, which parses to `NaN`. The API still returns **201**, and `NaN <= now` is never true, so the reminder never fires.
- The only validation test checks a missing field (`api.test.js:23`).

**Also:**
- `backoffDelay` has no direct test, and the tests pin `Math.random` to 0.5, so jitter is never exercised. Jitter is a fixed ±500ms (`retry.js:8`), so attempt 0 can come out negative and the delay can go over `maxDelayMs` by 500ms.
- `GET /reminders` and `/reminders/search` throw a `TypeError` when `query` is missing (`api.js:25`, `api.js:31`).
- `DELETE` has no ownership check (`api.js:37`). It's untested, but the service has no auth model at all.
- `db.js`, `index.js` and `startScheduler` have no direct tests. If `tickSeconds` is missing from config, the interval becomes `NaN` and Node runs it **every 1ms**.
- Not surviving a restart (`README.md:16`) is a missing feature, not a test gap.

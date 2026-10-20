**IST reminders get converted to UTC twice, so they fire 5h30m early.**

1. `src/api.js:8`: `toUtcMs` subtracts the offset when the reminder is created. `due_ms` is already UTC, which matches `README.md:37`.
2. `src/scheduler.js:9`: `dueReminders` subtracts `tz_offset_min * 60_000` a second time. The comment on line 7 wrongly says `due_ms` is wall-clock time.
3. For IST the offset is 330 min, so reminders fire **5h30m** early. That fits the "about 5 hours" users report. For UTC users the offset is 0, so nothing shifts.

**Example:** set 09:00 IST → `due_ms` = 03:30Z → the scheduler fires at 22:00Z the previous day, which is **03:30 IST**.

**Fix:** in `src/scheduler.js:9`, use `r.due_ms <= nowMs` and delete the misleading comment on line 7.

**Why tests pass:** `test/scheduler.test.js:6` only uses `tz_offset_min: 0`. A test with a 330 offset would catch this.

I traced this by reading the code and checked the arithmetic by hand. I didn't change any code or run the tests.

**Also:** there's an SQL injection in `searchReminders` (`src/api.js:31`). `userId` and `q` are pasted straight into the SQL string. Fix: use `?` placeholders like the other queries do.

**Cause: the timezone offset is applied twice.** IST reminders fire **5h30m early**.

1. `src/api.js:8`: `toUtcMs` already converts local time to UTC. For 09:00 IST it stores `due_ms` = 03:30Z, which is correct.
2. `src/scheduler.js:9`: `dueReminders` subtracts `tz_offset_min` again (`r.due_ms - r.tz_offset_min * 60_000`). Its comment wrongly says `due_ms` is wall-clock time.
3. Result: 03:30Z − 330 min = 22:00Z the day before. That is 03:30 IST, 5.5 hours before 09:00.
4. UTC users have `tz_offset_min = 0`, so the extra subtraction does nothing for them.

**Fix:** in `scheduler.js:9`, compare `r.due_ms <= nowMs` and drop the comment on line 7.

**Why the tests miss it:** `test/scheduler.test.js:6` only uses `tz_offset_min: 0`. A test that runs a +330 reminder through `toUtcMs` → `dueReminders` would catch it.

**Not verified by running:** the shell blocked my repro script and `node --test`. The 5h30m comes from reading the code. I haven't changed any files.

**Also:** there is **SQL injection** in `src/api.js:31`. `searchReminders` pastes `q.userId` and `q.q` straight into the SQL.

The timezone offset is subtracted twice, so reminders fire 5h30m early for India (+330 min).

1. `src/api.js:8`: `toUtcMs` already converts the local time to UTC (`Date.parse(at + 'Z') - tzOffsetMin * 60_000`), and that UTC value is what gets stored in `due_ms`.
2. `src/scheduler.js:9`: `dueReminders` then subtracts the offset again (`r.due_ms - r.tz_offset_min * 60_000`). The comment above it wrongly says `due_ms` is wall-clock time.

For UTC users the offset is 0, so subtracting it twice changes nothing. That's why they see no problem, and also why `test/scheduler.test.js` doesn't catch it: every test uses `tz_offset_min: 0`.

**Fix:** in `scheduler.js:9`, compare `r.due_ms <= nowMs` directly and correct the comment. Then add a test with `tz_offset_min: 330` that creates a reminder through the API path. I haven't changed any code.

**Separate security issue:** `searchReminders` at `src/api.js:31` builds its SQL by joining in `q.userId` and `q.q` directly, which allows SQL injection. It should use `?` parameters like the other queries do.

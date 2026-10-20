**The UTC offset is subtracted twice**: once on save, and again when checking if a reminder is due.

- `src/api.js:8`: `toUtcMs` already turns the local time into UTC: `due_ms = local − offset`.
- `src/scheduler.js:9`: `dueReminders` then subtracts it again: `r.due_ms - r.tz_offset_min * 60_000 <= nowMs`. The comment at line 7 wrongly says `due_ms` is wall-clock time.
- For India the offset is **330 min**, so reminders fire **5h30m early**. That's the "about 5 hours" users see. For UTC the offset is 0, so subtracting it twice changes nothing.

**Fix:** in `scheduler.js:9`, compare `r.due_ms <= nowMs` and correct the comment above it.

```
user sets 09:00 IST ──► api.js:8 stores due_ms = 03:30Z  (correct)
                        scheduler.js:9 checks 03:30Z − 5h30 = 22:00Z (day before)
                        ──► sent at 22:00Z = 03:30 IST, 5h30m early
```

**Why tests miss it:** `test/scheduler.test.js` only uses `tz_offset_min: 0`. The create test in `test/api.test.js` also uses offset 0. No test sends a non-zero offset through both the API and the scheduler.

**Not verified by running:** my Node check needed approval and didn't run, so this conclusion comes from reading the code. I haven't changed any files.

**Also:** `searchReminders` (`src/api.js:31`) builds SQL by joining strings with `userId` and `q`. That's an SQL injection risk once a real database replaces the in-memory stub.

**Cause: the IST offset is subtracted twice, so reminders fire 5h30m early.**

```
user sets 19:00 IST (tzOffsetMin = 330)
  └─► api.js:8        toUtcMs → due_ms = 13:30Z   (correct; already UTC)
        └─► scheduler.js:9  due_ms − 330 min = 08:00Z  (offset applied again)
              └─► fires at 08:00Z = 13:30 IST  →  5h30m early
```

- `src/api.js:8` already converts local time to UTC before saving. The README (`README.md:37`) agrees: `due_ms` is a UTC epoch.
- `src/scheduler.js:9` wrongly treats `due_ms` as wall-clock time. Its comment on line 7 says so, and it subtracts `tz_offset_min` again:
  ```js
  r.due_ms - r.tz_offset_min * 60_000 <= nowMs
  ```
- **UTC users are unaffected** because their offset is 0, so subtracting it twice changes nothing.
- The tests missed it: `test/scheduler.test.js` only uses `tz_offset_min: 0`.

**Fix:** in `src/scheduler.js:9`, compare `r.due_ms <= nowMs` and delete the wrong comment on line 7. Then add a scheduler test with `tz_offset_min: 330`.

**Proof:** I worked this out by reading the code only. My run of a repro script and `npm test` was denied permission, so neither has been run.

❓ **Needs you:** Should I make the fix and add the IST test? I'd also need permission to run `npm test`.

⚠ **Risk:** while reading `src/api.js:31` I also noticed `searchReminders`, which builds its SQL by joining in `q.userId` and `q.q` directly. That makes it open to **SQL injection**. It is unrelated to this bug, but worth fixing.

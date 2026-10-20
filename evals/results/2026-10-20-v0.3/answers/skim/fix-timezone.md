**✓ Fixed: the timezone offset was applied twice. 13/13 tests pass.**

- **Cause:** `api.js:8` already converts the user's local time to UTC when it stores `due_ms`. Then `src/scheduler.js:9` subtracted `tz_offset_min` a second time. For IST (+330) that made reminders fire **5.5h early**.
- **West of UTC too:** the same bug made reminders fire **late** for users west of UTC. A user at −300 got them 5h late.
- **Fix:** `src/scheduler.js:10` is now `!r.sent && r.due_ms <= nowMs`. The comment above it was wrong (it said `due_ms` is wall-clock time), so I corrected it.
- **No data migration needed:** the stored `due_ms` values were always correct. Pending reminders will fire on time once this is deployed. Reminders that already fired early stay marked as sent.

**Regression tests:** I added 2 to `test/scheduler.test.js`. Each creates a reminder through the real `handle` POST path, then checks it with `dueReminders`:
- 09:00 at +330 is not due at 22:00Z the night before or at 03:29Z, and is due at 03:30Z.
- 09:00 at −300 is not due at 13:59Z, and is due at 14:00Z.

**Checked against the old code:** copying the project to a temp folder needed approval, so I put the buggy line back in place for one run and then restored the fix. With the old line:
```
not ok 12 - 09:00 IST (+330) fires at 03:30Z, not earlier
  expected: 0
  actual: 1
not ok 13 - 09:00 EST (-300) fires at 14:00Z, not later
  expected: 1
  actual: 0
# pass 11
# fail 2
```
With the fix, `node --test test/` gives:
```
# tests 13
# pass 13
# fail 0
```

**Also:**
- **SQL injection** in `searchReminders` (`api.js:31`): `q.userId` and `q.q` are pasted straight into the SQL string. I didn't touch it.
- Each reminder stores one fixed `tz_offset_min`, so it can't follow daylight saving. A reminder set before a clock change will be an hour off after it. IST has no daylight saving, so India isn't affected.

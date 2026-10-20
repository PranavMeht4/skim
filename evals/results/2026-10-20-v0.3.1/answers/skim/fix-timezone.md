**✓ Fixed: the UTC offset was applied twice. `node --test test/` passes 13/13.**

- **Cause:** `src/api.js:8` already converts the local time to UTC before storing `due_ms`. Then `src/scheduler.js:9` subtracted `tz_offset_min` a second time.
- **Effect:** IST (+330) reminders fired **5h30m early**. West-of-UTC users got theirs late. The old tests only used offset 0, so they never caught it.
- **Fix:** `src/scheduler.js:9` is now `!r.sent && r.due_ms <= nowMs`. I also rewrote the comment on line 7, which described the wrong convention.
- **Regression tests:** two new tests in `test/scheduler.test.js` create a reminder through the real API and then check `dueReminders`:
  - **+330:** not due at 03:29Z, due at 03:30Z
  - **−300:** not due at 13:59Z, due at 14:00Z
- **Verified:** both new tests failed before the fix (`expected: 0, actual: 1` and `expected: 1, actual: 0`). All 13 pass after it.
- **No data migration needed.** The stored `due_ms` values were always correct UTC. Only the scheduler's comparison was wrong.

**Also:** `searchReminders` (`src/api.js:30-31`) builds its SQL by joining strings, so it's open to SQL injection through `userId` or `q`. I didn't change it.

**Fixed: the scheduler applied the user's UTC offset a second time.** All **13/13 tests pass** with `node --test test/`.

1. **Cause:** `api.js:8` (`toUtcMs`) already converts the local time to UTC when the reminder is created. `src/scheduler.js:9` then **subtracted `tz_offset_min` again** before comparing with the current time.
2. **Effect:** IST (+330) reminders fired **5h30 early**. The same bug made **users west of UTC get reminders late**, for example 5h late at UTC-5. Nobody had reported that yet.
3. **Fix:** `src/scheduler.js:9` now compares `r.due_ms <= nowMs` directly. I also corrected the comment that wrongly said `due_ms` is wall-clock time.
4. **Regression tests:** I added 2 tests to `test/scheduler.test.js`, one east (+330) and one west (-300). They build `due_ms` with the real `toUtcMs`, and both **failed before the fix**.
5. **No data migration needed:** the stored `due_ms` values were always correct; only the comparison was wrong. The DB is in-memory anyway.

The fix belongs in the scheduler, not in `api.js`. The README defines `due_ms` as a UTC epoch, and `test/api.test.js:10-13` already locks in `toUtcMs`'s conversion. Nothing else reads `tz_offset_min` (`notify.js`, `format.js` and `legacy.js` don't touch it).

**Also (not fixed, out of scope):** `searchReminders` builds its SQL by **string concatenation** (`api.js:31`). That's a SQL injection risk, and it will matter once the in-memory DB is swapped for a real one.

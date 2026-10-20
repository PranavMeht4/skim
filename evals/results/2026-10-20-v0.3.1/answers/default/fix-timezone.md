I fixed it: reminders now fire at the time the user picked, whatever their timezone. `node --test test/` passes all 13 tests.

**Cause:** the UTC offset was applied twice.
- `src/api.js` (`toUtcMs`) already turns the user's local time into UTC when it saves `due_ms`. The README and the existing API tests agree that `due_ms` is UTC.
- `src/scheduler.js:9` then subtracted `tz_offset_min` again: `r.due_ms - r.tz_offset_min * 60_000 <= nowMs`.

So reminders fired early by the user's offset: a 09:00 IST reminder went off at 03:30 IST, 5½ hours early. Users west of UTC had the opposite problem and got reminders late by their offset (5 hours in US Eastern), which nobody may have reported yet.

**Fix:** `src/scheduler.js` now compares `due_ms <= nowMs` directly, and the comment that wrongly called `due_ms` local time is corrected. No other code shifts the time: I searched `src/` and `config.json` for other offset or local-time handling and found none.

**Regression tests** (added to `test/scheduler.test.js`):
1. A scheduler-only test with IST (+330) and US Eastern (−300) reminders. Each must be due exactly at its UTC time, not a minute before.
2. An end-to-end test that creates a 09:00 IST reminder through the API and checks the scheduler doesn't fire it at 03:30 IST, but does at 09:00 IST (03:30 UTC). This one checks that the API and scheduler agree on what `due_ms` means, which is where the bug was.

I put the old line back briefly to check: both new tests failed on it (11/13 passing), then passed again with the fix.

The store is in memory only, so no saved reminders have a wrong time and nothing needs migrating. Nothing is committed, because this folder isn't a git repository.

I also noticed something I didn't change: `searchReminders` in `src/api.js:31` pastes `userId` and `q` straight into the SQL string, which leaves it open to SQL injection. It should use `?` placeholders like the other queries.

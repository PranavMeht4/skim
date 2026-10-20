**✓ Fixed: the timezone offset was applied twice. 13/13 tests pass.**

**Cause:**
- `src/api.js:8`: `toUtcMs` already turns local time into UTC when the reminder is created.
- `src/scheduler.js:9` (old): it subtracted `tz_offset_min` from `due_ms` a second time. With IST (+330), reminders fired **5h30m early**.

**Fix:** `src/scheduler.js:11` now compares `r.due_ms <= nowMs` with no offset. I also corrected the comment above it, which wrongly said `due_ms` was wall-clock time.

**Regression tests** (`test/scheduler.test.js`): both create a reminder through the real `POST /reminders` handler.
- **East (+330):** 09:00 IST is not due at 03:29Z and is due at 03:30Z.
- **West (−300):** 09:00 is not due at 13:59Z and is due at 14:00Z.

**Verified:**
- I put the old line back temporarily. Both new tests failed (`expected: 0, actual: 1` east; `expected: 1, actual: 0` west). Then I restored the fix.
- `node --test test/`: **13 pass, 0 fail**.
- A search of `src/` for `tz_offset_min`/`due_ms` shows nothing else applies the offset.

**Also affected:** users **west** of UTC got reminders **late** by their offset (5h for UTC−5). Nobody had reported that yet.

**No data migration needed:** the stored `due_ms` values were always correct UTC. Only the scheduler's comparison was wrong. Nothing was committed because the folder isn't a git repo.

**Also:** `searchReminders` (`src/api.js:31`) builds SQL by joining strings with `q.userId` and `q.q`, so it is open to SQL injection. I left it unchanged.

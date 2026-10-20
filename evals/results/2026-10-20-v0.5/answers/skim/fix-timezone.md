**Fixed: the scheduler applied the UTC offset twice. All 13 tests pass.**

1. **Cause:** `src/api.js:8` (`toUtcMs`) already converts the user's local time to UTC when a reminder is created. Then `src/scheduler.js:9` subtracted `tz_offset_min` again. So **IST reminders fired 5h30m early**, and anyone **west of UTC got theirs late** (for example, UTC-5 was 5h late).
2. **Fix (`src/scheduler.js:6-10`):** the due check is now `!r.sent && r.due_ms <= nowMs`, and the comment that described the wrong rule is corrected. `api.js` is unchanged because its output already matches the README and its own test.
3. **No data migration needed:** stored `due_ms` values were always correct. Only the read side was wrong.
4. **Regression test (`test/scheduler.test.js`):** it creates a 09:00 reminder through the API, then runs `tick()`. It checks the reminder doesn't fire 1 minute early and does fire on time, for **IST (+330 → 03:30Z)** and **UTC-5 (−300 → 14:00Z)**.
5. **Failed before the fix:** IST gave `fired before the user's local time` and UTC-5 gave `did not fire at the user's local time`.
6. **Passes after the fix:** `node --test test/` → `# tests 13`, `# pass 13`, `# fail 0`.

The old scheduler tests didn't catch this because they all used offset `0`.

**Also:** I didn't touch this: the search query in `src/api.js:31` builds SQL by string concatenation from `userId` and `q`, so it's **open to SQL injection**. Nothing was committed because this folder isn't a git repo.

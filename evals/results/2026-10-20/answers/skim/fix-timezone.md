**Cause: the timezone offset was applied twice. IST reminders fired 5h30m early. Fixed, and all 12/12 tests pass.**

```
09:00 IST ─► api.js:8 converts to UTC ─► due_ms = 03:30Z  (correct)
          ─► scheduler.js:9 subtracts 330 min again ─► fires 22:00Z the day before
                                                      = 03:30 IST (5h30m early)
```

**Cause:** `toUtcMs` in `src/api.js:8` already stores `due_ms` as UTC, and the README says the same. `dueReminders` in `src/scheduler.js:9` then subtracted `tz_offset_min` a second time.

**Fix:** `src/scheduler.js:9` now compares `r.due_ms <= nowMs` directly, and I corrected the comment above it. No other code changes the fire time. I checked `index.js`, `notify.js`, `format.js`, `legacy.js` and `retry.js`.

**Proof:**

| Check | Result |
|---|---|
| New test against the old logic | ✗ fails: `expected: 0, actual: 1` |
| New test against the fix | ✓ passes |
| `node --test test/` | ✓ **12 pass, 0 fail** |

The new test is in `test/scheduler.test.js`. It creates reminders through the API at 09:00 local time with offsets of +330 (IST) and −300 (EST). It checks that each one is not due a minute early and is due exactly on time.

**Notes:**
- Users **west** of UTC were hit too. Their reminders fired **late** by their offset (5h for EST). The fix covers both directions.
- **No data migration needed.** Stored `due_ms` values were always correct UTC, and the DB is in-memory anyway.
- This folder is not a git repo, so nothing was committed.

⚠ **Risk:** I found a SQL injection bug outside this task. `searchReminders` at `src/api.js:31` builds its SQL by concatenating the user's input (`userId` and `q`) into the query string. Anyone can send crafted input to read other users' reminders. I did **not** fix it, because it wasn't part of this task.

❓ **Needs you:** Should I fix the SQL injection at `src/api.js:31` now, using `?` parameters like the other queries do?

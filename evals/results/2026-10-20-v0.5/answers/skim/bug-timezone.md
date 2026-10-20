**Cause: the timezone offset is applied twice.** Reminders fire **5h30m early** for IST, which matches the "about 5 hours" users report.

1. **First conversion, which is correct:** `api.js:16` → `toUtcMs()` (`api.js:8`) already stores `due_ms` as **UTC** (09:00 IST → 03:30Z).
2. **Second conversion, which is the bug:** `scheduler.js:9` subtracts `tz_offset_min` again: `r.due_ms - r.tz_offset_min * 60_000 <= nowMs`. That moves 03:30Z back to **22:00Z the previous day**, which is 03:30 IST.
3. **Why UTC users are fine:** their offset is **0**, so subtracting it twice changes nothing.
4. **Fix:** in `scheduler.js:9`, compare `r.due_ms <= nowMs` directly. Also correct the misleading comment at `scheduler.js:7`, which says `due_ms` is wall-clock time. It isn't.
5. **Why tests missed it:** `test/scheduler.test.js` only uses `tz_offset_min: 0`. A test with offset **330** would have caught it.

```flow
POST at=09:00, tzOffsetMin=330 -> toUtcMs -> due_ms=03:30Z -> scheduler subtracts 330 again -> fires 22:00Z (03:30 IST)
```

**Not verified by running:** my repro script and `npm test` were blocked by the permission prompt, so this comes from reading the code and working the numbers by hand. I made **no edits**.

**Also:** there's **SQL injection** in `searchReminders` at `api.js:31`, where `userId` and `q` are concatenated straight into the SQL string. It's unrelated to this bug.

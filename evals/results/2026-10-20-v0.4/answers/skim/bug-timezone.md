**Cause: the IST offset is subtracted twice, so reminders fire 5h30m early.**

- **Cause:** `api.js` already stores `due_ms` in UTC, and the scheduler subtracts the offset again (`src/scheduler.js:9`)
- **Why UTC works:** UTC users have an offset of 0, so subtracting it twice changes nothing
- **Fix:** compare `r.due_ms <= nowMs` directly and drop the offset math
- **Proof:** by hand only. My repro script and `npm test` needed approval and did not run
- **Also:** `searchReminders` builds SQL by gluing strings together, so it allows SQL injection (`src/api.js:31`)

───

**The trace** for an IST user who sets `09:00` (`tzOffsetMin: 330`):

```
api.js:8        Date.parse("2026-03-01T09:00:00Z") - 330 min
                = 2026-03-01T03:30Z   ← correct UTC, stored as due_ms
scheduler.js:9  due_ms - 330 min
                = 2026-02-28T22:00Z   ← fires here, 5h30m early
```

The comment at `src/scheduler.js:7` says "due_ms is the user's wall-clock time". That is wrong: `toUtcMs` converts to UTC before the insert (`src/api.js:16`). The error is always exactly the user's offset. Users west of UTC get theirs late instead of early.

**Fix** (`src/scheduler.js:6-10`):

```js
// A reminder is due once its time has arrived and it has not been sent.
// due_ms is already UTC (converted in api.js toUtcMs).
export function dueReminders(reminders, nowMs) {
  return reminders.filter((r) => !r.sent && r.due_ms <= nowMs);
}
```

**Why the tests missed it.** Every case in `test/scheduler.test.js` uses `tz_offset_min: 0`, which hides the bug. Add a test that sets `tz_offset_min: 330` and `due_ms` at `03:30Z`. Check that the reminder is not due at `03:29Z` and is due at `03:30Z`.

**Not verified:** I didn't run the repro script or `npm test`. The command was blocked at the approval prompt. The trace above is my own arithmetic from the code.

**SQL injection detail.** `q.userId` and `q.q` go straight into the SQL string. Use `?` placeholders, as `listReminders` already does.

**It's a double timezone conversion. The offset is subtracted once when the reminder is saved and again when it is checked.** For IST that makes reminders fire **5h30m early**. For UTC the offset is 0, so nothing shifts.

1. **First conversion (correct):** `src/api.js:8`. `toUtcMs` subtracts `tzOffsetMin`, so `due_ms` is already UTC. The README says the same (`due_ms` is "the same moment as `at`, as a UTC epoch").
2. **Second conversion (the bug):** `src/scheduler.js:9`. `r.due_ms - r.tz_offset_min * 60_000 <= nowMs` subtracts the offset a second time. The comment on line 7 wrongly says `due_ms` is wall-clock time.

**Example:** a user sets 09:00 IST.
```
at = 09:00 IST  →  due_ms = 03:30Z        (api.js, correct)
scheduler fires at due_ms − 330 min = 22:00Z the previous day = 03:30 IST   ← 5.5 h early
```

**Fix:** in `src/scheduler.js:9`, compare `r.due_ms <= nowMs` and delete the misleading comment on line 7. I haven't changed any code.

**Why tests didn't catch it:** `test/scheduler.test.js:6` only uses `tz_offset_min: 0`. There is no test that creates a reminder with an offset and then runs it through the scheduler.

**Not verified by running:** my reproduction script and `node --test` were denied permission. This finding comes from reading the code and working through the arithmetic by hand.

**Also:** `src/api.js:31` builds the search SQL by string concatenation from `q.userId` and `q.q`, which makes it open to SQL injection.

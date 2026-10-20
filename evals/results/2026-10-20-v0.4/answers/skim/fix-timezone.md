**✓ Timezone bug fixed. 12/12 tests pass.**
- **Cause:** the offset was applied twice. `api.js` stores `due_ms` as UTC, then the scheduler subtracted the offset again (`src/scheduler.js:9`)
- **Effect:** IST reminders fired **5h30m early**. Users west of UTC got theirs late by the same amount (New York: 5h late)
- **Fix:** the scheduler now compares `r.due_ms <= nowMs` directly
- **Proof:** the new IST/New York test fails on the old code and passes on the fix
- **Also:** `searchReminders` builds SQL by joining strings, so it is open to SQL injection. I did not change it (`src/api.js:31`)

───

```
src/scheduler.js        +2 −2   compare due_ms directly; fix comment
test/scheduler.test.js +13      IST (+330) and New York (−300) test
```

**Trace for 09:00 IST** (`tzOffsetMin: 330`):

```
api.js toUtcMs     09:00 local − 5:30  →  03:30Z stored in due_ms   (correct)
scheduler (old)    03:30Z − 5:30       →  22:00Z the previous day   (fires 5.5h early)
scheduler (new)    03:30Z              →  fires at 03:30Z           (correct)
```

**How the test was checked.** I put the old line back and ran the new test. It failed:

```
not ok 2 - a reminder fires at the local time the user picked, not offset again
  expected: 0
  actual: 1
  (scheduler.test.js:18)
```

With the fix back in place, `node --test test/` passes 12 of 12. That is the 11 old tests plus the new one.

**No data migration needed.** The stored `due_ms` values were always correct. Only the comparison in the scheduler was wrong.

**Cause: the timezone offset was applied twice.** `src/api.js:8` already turns the user's local time into UTC when a reminder is created, and then `src/scheduler.js:9` subtracted the offset again.

1. **Symptom:** a reminder set for **09:00 IST** should fire at 03:30 UTC, but it fired at **22:00 UTC the day before**, **5.5h early**.
2. **The same bug makes west-of-UTC users late:** a reminder at UTC-5 fired **5h late**. Nobody reported it, but the same fix covers it.
3. **Fix (`src/scheduler.js:8-10`):** compare `r.due_ms <= nowMs` directly. That matches the README, which defines `due_ms` as a UTC time. I also corrected the misleading comment above it.
4. **Regression test (`test/scheduler.test.js`):** it creates reminders through the real `POST /reminders` handler at **+330 (IST)** and **-300 (UTC-5)**, then checks each fires at exactly the right UTC minute and not one minute before. The old tests only used offset 0, which is why they never caught this.
5. **`node --test test/`: 12 pass, 0 fail.**

**Caveat:** I did **not** run the test suite against the old code; that command was blocked. Instead, a small script showed the old formula would fire the IST reminder at 22:00 UTC the day before. So the new test's "not yet due at 03:29 UTC" check would have failed. That was checked by hand, not by a test run.

**No data migration needed:** saved `due_ms` values were always correct; only the scheduler misread them. The store is also in-memory.

**Also:**
- **SQL injection** in `searchReminders` (`src/api.js:31`): `userId` and `q` are pasted straight into the SQL string. I didn't fix it because it's outside this task.
- This folder is **not a git repo**, so **nothing was committed**.

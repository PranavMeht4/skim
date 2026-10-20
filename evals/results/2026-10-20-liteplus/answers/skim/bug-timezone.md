**Cause: the timezone offset is subtracted twice**, so IST reminders fire **5h30m early**.

1. **First conversion (correct):** `toUtcMs` turns local time into UTC by subtracting the offset (`src/api.js:8`). 09:00 IST becomes **03:30Z** and is saved as `due_ms`.
2. **Second conversion (the bug):** `dueReminders` subtracts the offset from `due_ms` again (`src/scheduler.js:9`). That moves 03:30Z back to **22:00Z the day before**, which is **03:30 IST**.
3. **Why UTC users are fine:** their offset is 0, so subtracting it twice changes nothing. **Every other zone is wrong.** Zones east of UTC fire early, and zones west of UTC fire **late** (US Eastern, -300, fires 5h late).
4. **Fix:** change `src/scheduler.js:9` to `r.due_ms <= nowMs`, and delete the wrong comment on line 7. The README already defines `due_ms` as a UTC epoch.
5. **Why the tests missed it:** `test/scheduler.test.js:6` only uses `tz_offset_min: 0`. Add a case with offset 330 where `due_ms` is 03:30Z, and check that it is **not due at 22:00Z** and **is due at 03:30Z**.

**Not verified by running:** my reproduction script needed permission I didn't have in this session, so I didn't run it or the test suite. The numbers above come from reading the code by hand. `test/api.test.js:12` confirms the first conversion gives 03:30Z. I didn't edit any files.

**Also:** I spotted an unrelated **SQL injection** in `searchReminders`. It builds the query by concatenating `userId` and `q` into the SQL string (`src/api.js:31`).

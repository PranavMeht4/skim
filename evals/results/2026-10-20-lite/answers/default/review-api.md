I found four real problems, listed most serious first. I couldn't run anything (the test and probe commands needed permissions I didn't have), so all of this comes from reading the code, not from a run.

### 1. Reminders fire at the wrong time for any user not on UTC
The bug is in the scheduler, not in `api.js`. `toUtcMs` (`src/api.js:8`) is correct: `due_ms` is stored as UTC, which matches the README. But `src/scheduler.js:9` applies the offset a second time: `r.due_ms - r.tz_offset_min * 60_000 <= nowMs`. Its comment wrongly says `due_ms` is the user's local time.

- **IST user (offset 330), reminder at 09:00 local:** stored as 03:30Z, fires at 22:00Z the day before. That's **5.5 hours early**.
- **US Eastern user (offset -300):** fires **5 hours late**.

The tests miss this because every scheduler test uses offset 0, and the create test also uses offset 0. **Fix:** make the scheduler check `r.due_ms <= nowMs`, and add a test that creates a reminder with a non-zero offset and runs it through the scheduler.

### 2. Bad input is accepted with 201, and the reminder never fires
`src/api.js:13` only checks that `at` is present, and line 8 assumes the exact format `YYYY-MM-DDTHH:mm`. Any other format becomes `NaN`:
- `"2026-03-01T09:00:00"` (with seconds) becomes `...09:00:00:00Z`.
- `"2026-03-01T09:00Z"` and `"2026-03-01"` also fail to parse.
- A non-numeric `tzOffsetMin` gives `NaN` too.

`NaN <= now` is always false, so the reminder is stored and never sent, with no error anywhere. **Fix:** check `at` against a strict regex, require `tzOffsetMin` to be an integer (roughly -720 to 840), reject a `NaN` result with 400, and return the reason.

### 3. SQL injection in search (`src/api.js:31`)
Both `userId` and `q` are pasted straight into the SQL string. The in-memory stub happens to block this because it doesn't understand `OR`. The README says the stub has to be replaced so data survives restarts, and with a real database `userId=x' OR '1'='1` returns every user's reminders. Even an ordinary search like `mum's` would break the query. **Fix:** use placeholders like the other handlers (`... user_id = ? AND text LIKE ?` with `['%' + q + '%']`), and escape `%` and `_` in the search text if they should match literally.

### 4. Delete has no owner check (`src/api.js:35-38`)
`DELETE /reminders/:id` deletes by id alone. IDs are sequential numbers, so anyone can delete everyone's reminders by counting up. List and search also trust whatever `userId` the caller sends. How much this matters depends on whether an auth layer will sit in front. Right now nothing does: `src/index.js` only starts the scheduler, and only the tests call `handle()`. At minimum, scope the delete: `WHERE id = ? AND user_id = ?`.

### Smaller issues, worth fixing but not urgent
- **Missing parameters:** with no `userId`, list and search quietly search for user `'undefined'`. With no `query` object at all, they throw a TypeError. Both should return 400.
- **Daylight saving:** the service stores one fixed offset, not a timezone name. A reminder created before a clock change, for a date after it, will fire an hour off. This doesn't affect IST, which has no daylight saving. Storing a timezone name like `Asia/Kolkata` would fix it if you have users in zones that change their clocks.

Problems 1 and 2 are the ones users will hit: wrong delivery times and reminders that silently never arrive. I haven't changed any code. Do you want me to make the fixes and add the missing offset test?

**Hold due reminders in `tick` while the user's local clock is in quiet hours.**
- ⛔ **Fix first:** the offset is applied twice, so IST reminders fire 5.5h early (`src/scheduler.js:9`)
- **Store + API:** a per-user `quiet_hours` table and `PUT/GET/DELETE /quiet-hours` routes
- **Hold:** `tick` skips users who are quiet now; the first tick after 07:00 sends them (`src/scheduler.js:14`)
- **Also:** search builds SQL by joining strings, so it can be injected (`src/api.js:31`)
- ❓ **Needs you:** should quiet hours use an IANA zone (handles DST, my pick) or a fixed offset like reminders do?

───

**Not verified by running.** I tried to run node to confirm the offset bug, but the command needed approval and this session can't grant it. The bug claim comes from reading the code and doing the math. I did not run the test suite.

**Step 0: fix the double offset (blocks everything else)**
- `toUtcMs` already stores `due_ms` as UTC (`src/api.js:8`), and the README agrees (`README.md:37`).
- `dueReminders` then subtracts `tz_offset_min` a second time.
- Example: an IST 09:00 reminder has `due_ms` = 03:30Z. It fires at 22:00Z the day before, which is 03:30 IST. A UTC−5 user's reminder fires 5h late.
- The tests only use offset 0 (`test/scheduler.test.js:6`), so they still pass.
- Quiet hours would partly hide this bug: the 03:30 IST send would be held until 07:00, which looks almost right.
- Fix: compare `r.due_ms <= nowMs`, correct the comment, and add a test at offset 330.

**Design: hold when sending, not when creating**

```
tick(now)
  rows = SELECT * FROM reminders WHERE sent = 0
  qh   = SELECT * FROM quiet_hours        -> Map by user_id (≤5,000 rows)
  for r in dueReminders(rows, now)        (due_ms <= now, sorted by due_ms)
     isQuietAt(now, qh.get(r.user_id)) ?
        yes -> skip; stays sent=0; checked again next tick
        no  -> send, mark sent
```

This design has five advantages:
- It adds no reminder columns, migration or queue, which fits the README's no-new-infra rule.
- Changing or removing quiet hours takes effect on the next tick.
- A reminder that failed before 22:00 and is still unsent is held too.
- "Sent after the window ends" comes for free: it goes out at most 30s after 07:00.
- `dueReminders` stays pure. The quiet check is a separate pure function.

**Steps**
1. **`src/quiet.js` (new):**
   - `parseHHmm("22:00") → 1320`
   - `localMinuteOfDay(nowMs, timeZone)` using `Intl.DateTimeFormat` with `hourCycle: 'h23'` (built into Node 20, no new dependency)
   - `isQuietAt(nowMs, qh)`
2. **`src/db.js`:**
   - Add `quiet_hours` rows `{ user_id, start_min, end_min, time_zone }`.
   - Support an upsert, `SELECT` with and without `WHERE user_id = ?`, and `DELETE`.
   - Clear the table in `reset()`.
   - Today's `DELETE` and `SELECT` patterns only match the `reminders` table.
3. **`src/api.js`:**
   - Follow the existing style, with `userId` in the body or query, and parameterized queries only.
   - `PUT /quiet-hours` takes `{ userId, start, end, timeZone }` and returns 200.
   - `GET /quiet-hours?userId=` returns 200, or 404 if none is set.
   - `DELETE /quiet-hours?userId=` returns 204, or 404.
   - Validation returns 400 for: missing fields, times that aren't `HH:mm` from 00:00 to 23:59, `start === end` (it's unclear whether that means no window or a 24h one), and a bad zone (`Intl` throws `RangeError`).
4. **`src/scheduler.js`:**
   - Do the step 0 fix and the skip shown above.
   - Sort due reminders by `due_ms` so the 07:00 batch goes out in the order they were due.
   - Add a `running` flag in `startScheduler` so a tick never starts while the last one is still running.
5. **`README.md`:** document the new table and routes.

**Why the `running` guard matters now.** `setInterval` doesn't wait for the async `tick` to finish. `withRetry` with 5 attempts adds about 3s of backoff for each failing reminder. Ten failing sends can therefore push a tick past 30s. The next tick then reads the same `sent = 0` rows and sends them twice. That risk exists today, but quiet hours bunch every held reminder into the tick right after 07:00.

**Edge cases**

| Case | Behavior |
|---|---|
| 22:00–07:00 (wraps midnight) | quiet if minute ≥ 1320 or < 420 |
| 13:00–15:00 (same day) | quiet if 780 ≤ minute < 900 |
| exactly 22:00 / 07:00 | held / sent (window is half-open) |
| no settings for user | never held |
| reminder set for 23:00 on purpose | held until 07:00, as you asked |
| DST change | IANA zone: correct. Fixed offset: 1h off until the user updates it |
| tick straddles 22:00 | can send up to about 30s into the window; accepted |

**Tests**
- `test/quiet.test.js` (new): window edges, wrap vs same-day, and a DST date (America/New_York, 2026-03-08).
- `test/scheduler.test.js`: the IST regression, plus a `tick` test using `{ formatter: 'format', out }`. Held at 23:00, sent at 07:00, not held at 21:59.
- `test/api.test.js`: PUT valid, the 400 cases, GET and DELETE.

**If you pick a fixed offset instead:** store `tz_offset_min` on `quiet_hours` and compute the local minute arithmetically. It's simpler, but it shares the reminders' DST weakness. Don't reuse each reminder's own `tz_offset_min`: one user could then end up with different windows on different reminders.

**Out of scope, noted:**
- Settings live in the in-memory db, so they are lost on restart like reminders (`README.md:16`).
- The create response doesn't say when a held reminder will really go out. That's an easy follow-up.
- Sending one digest instead of separate messages at 07:00 isn't planned.

```
src/quiet.js            new   parseHHmm, localMinuteOfDay, isQuietAt
src/scheduler.js              offset fix, quiet skip, sort, running guard
src/db.js                     quiet_hours upsert/select/delete, reset
src/api.js                    PUT/GET/DELETE /quiet-hours + validation
README.md                     quiet_hours fields and routes
test/quiet.test.js      new
test/scheduler.test.js        IST regression, hold/release via tick
test/api.test.js              quiet-hours routes
```

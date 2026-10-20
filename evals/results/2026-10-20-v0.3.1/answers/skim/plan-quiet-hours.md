**Plan: check quiet hours at send time.** During the window the scheduler skips the user's due reminders. The first tick after 07:00 sends them.

1. **Fix the timezone bug first** (`scheduler.js:9`). The offset is applied twice, so reminders already fire at the wrong time.
2. **Storage:** add a `quiet_hours` table `{ user_id, start, end, tz }` to `db.js`.
3. **Check:** add a pure `isQuiet(setting, nowMs)` in a new `src/quiet.js`. It handles windows that cross midnight.
4. **Scheduler:** in `tick`, skip quiet users **before** `withRetry`, and send in `due_ms` order.
5. **Overlap guard:** stop a new tick from starting while the last one is running (`scheduler.js:26`). Without it the 07:00 burst can double-send.
6. **API:** add `PUT`/`GET`/`DELETE /users/:id/quiet-hours` in `api.js`, with validation.
7. **Tests and README:** new `test/quiet.test.js`, plus additions to the scheduler and API tests.

**Not verified:** I confirmed step 1 by reading the code and doing the arithmetic. I didn't run anything, because the command to run it and the tests needed approval.

**Also:**
- **SQL injection** in `searchReminders`: `q.userId` and `q.q` are pasted into the SQL string (`api.js:30-31`).
- Quiet-hours settings will be **lost on restart**, the same as reminders (`README.md:16`).

---

**1. Double timezone shift.** `api.js:8` already stores `due_ms` as UTC, and `README.md:37` agrees. `scheduler.js:9` subtracts the offset a second time, and the comment at `:7` is wrong.
- A 09:00 IST reminder is stored as 03:30Z. It fires at 03:30Z − 5h30 = **22:00Z the day before**, which is **5.5h early**.
- US Eastern (−300) fires **5h late**.
- The tests miss it because `scheduler.test.js:6` uses offset 0.
- Fix: `!r.sent && r.due_ms <= nowMs`. Add tests with offsets 330 and −300.

The quiet-hours math reads local time from the same data, so its tests would look wrong until this is fixed.

**2. Storage.** There is no users table. `db.js:37-66` only parses statements on `reminders`.
- Add branches for: upsert by `user_id`, `SELECT * FROM quiet_hours` (all rows, and `WHERE user_id = ?`), and `DELETE … WHERE user_id = ?`.
- Clear the new table in `reset()`.
- Example row: `{ user_id: 'u1', start: '22:00', end: '07:00', tz: 'Asia/Kolkata' }`.

**Timezone:** I recommend an **IANA zone stored with the setting**, not `tz_offset_min`.
- `tz_offset_min` belongs to each reminder, not to the user.
- A fixed offset doesn't follow daylight saving. For half the year a "22:00" window would start at 21:00 or 23:00.
- Node 20's `Intl` handles IANA zones with no dependencies.
- If clients can only send an offset, accept `tzOffsetMin` as a fallback and document that it ignores daylight saving.

**3. The check (`src/quiet.js`).**
- `localMinutes(nowMs, tz)`: call `Intl.DateTimeFormat` with `{ timeZone: tz, hour, minute, hourCycle: 'h23' }`, then `formatToParts`, giving `h*60 + m`. Use `hourCycle: 'h23'`, because `hour12: false` can return `24` at midnight. Cache one formatter per zone.
- If `start < end`, it's quiet when `start <= t && t < end`.
- If `start > end` (crosses midnight), it's quiet when `t >= start || t < end`.
- Start is inclusive and end is exclusive: 22:00 is quiet, 07:00 is not.
- If `start == end`, the API rejects it, since it could mean "off" or "all day".

**4. Scheduler.**
```
unsent ─► dueReminders ─► sort by due_ms ─► isQuiet(user)? ─yes─► skip (sent stays 0)
                                                         └─no──► withRetry(send) ─► sent = 1
```
- Load every `quiet_hours` row once per tick into a `Map` keyed by `user_id`. That's cheap at ≤5,000 reminders.
- Run the check before `withRetry`, so a held reminder doesn't use up retries or get logged as `failed`.
- Held reminders go out **at most 30s** after the window ends (`tickSeconds`).
- **Why not at create time:** shifting `due_ms` when a reminder is created would lock in the setting. A user who later changes or clears their quiet hours would still get those reminders late. Checking at send time applies changes on the next tick, and `at`/`due_ms` keep the time the user picked.
- No formatter change is needed. Both formats include `at`, so a held reminder still shows its original time (`format.js:3`, `legacy.js:4`).

**5. Overlap guard.** `setInterval` doesn't wait for `tick` to finish.
- At 07:00, every held reminder goes out in a single tick.
- A send that keeps failing waits about **3s** between its 5 attempts (200+400+800+1600 ms). About 10 of those use up the 30s tick.
- The next tick then re-reads `sent = 0` rows, including ones still being sent, which leads to **double sends**.
- Fix: an in-memory `running` flag that skips a tick while the previous one is still running. That's enough because there is only one process (`README.md:14`).

**6. API.**
- `PUT /users/:id/quiet-hours` with body `{ start, end, tz }` returns 200.
- `GET` returns 200, or 404 if none is set.
- `DELETE` returns 204.
- It returns 400 when:
  - a time isn't `HH:mm` in range: `/^([01]\d|2[0-3]):[0-5]\d$/`
  - the zone is invalid: `new Intl.DateTimeFormat('en-US', { timeZone })` throws `RangeError`
  - `start == end`
- Use `?` parameters only. Don't copy the string-built SQL from `searchReminders`.

**7. Tests.**
- `quiet.test.js`:
  - 22:00–07:00 checked at 21:59, 22:00, 03:00, 06:59 and 07:00
  - a window that doesn't cross midnight, e.g. 13:00–14:00
  - `Asia/Kolkata`
  - a daylight-saving case: in `America/New_York`, 22:00 local is 03:00Z in winter and 02:00Z in summer
- `scheduler.test.js`:
  - offsets 330 and −300 fire on time
  - a reminder due at 23:00 local is still held at 06:59 and sent at 07:00
  - users without quiet hours are unaffected
  - clearing quiet hours releases held reminders on the next tick
  - a tick that starts while another is running is skipped
- `api.test.js`: set, get and clear, plus 400s for `25:00`, `Mars/Olympus` and `start == end`.
- README: add the `quiet_hours` fields and routes. Fix the comment at `scheduler.js:7`.

Steps 1 and 5 fix bugs that exist today, so they can ship on their own first.

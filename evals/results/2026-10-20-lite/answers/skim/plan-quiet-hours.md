**Plan: decide the hold when each reminder is about to be sent, not when it's created.** On each tick, a user's due reminders are skipped while their local time is inside their window. They go out on the first tick after the window ends. There's no stored "held" state and no new infrastructure. **One timezone bug has to be fixed first.**

**Steps, in order:**
0. **Fix the doubled timezone shift.** `api.js:16` already converts `due_ms` to UTC, and then `scheduler.js:9` subtracts `tz_offset_min` again.
   - A 09:00 IST (offset 330) reminder fires at **03:30 IST**. That's inside a 22:00–07:00 window, so with quiet hours it would arrive at 07:00, not 09:00. Users west of UTC (negative offsets) get reminders late instead.
   - Fix: change the check to `r.due_ms <= nowMs` and correct the comment at `scheduler.js:7`.
   - Add a test with offset 330. The current tests only use offset 0 (`scheduler.test.js:6`), which is why nothing catches it.
1. **New `src/quiet-hours.js`** (pure functions):
   - parse `HH:mm` into a minute of the day
   - get the user's local minute of the day from `Intl.DateTimeFormat` (`hourCycle: 'h23'`)
   - `isQuiet(prefs, nowMs)`
2. **`src/db.js`: add a `quiet_hours` table** with `user_id, start_min, end_min, time_zone`. The stand-in only parses statements on `reminders` (`db.js:37-65`). An upsert is a DELETE plus an INSERT by `user_id`, and the scheduler reads all rows at once.
3. **`src/scheduler.js`:** change to `dueReminders(reminders, nowMs, quietByUser = new Map())`. The default keeps existing callers and tests working. `tick()` loads all quiet-hours rows **once per tick** into a Map and sends in `due_ms` order.
4. **Stop ticks from overlapping.**
   - `setInterval` (`scheduler.js:26`) starts a new tick without waiting for the last one.
   - `sent` is only set after the send succeeds (`:17`).
   - A failing send retries for about 3s (5 attempts).
   - Quiet hours pile sends up at 07:00, so a slow burst can run into the next tick and send reminders **twice**. Skip a tick while one is still running.
5. **`src/api.js`: add `GET|PUT|DELETE /users/:userId/quiet-hours`.**
   - Body: `{ "start": "22:00", "end": "07:00", "timeZone": "Asia/Kolkata" }`.
   - Return 400 for a bad `HH:mm`, for `start === end`, and for an invalid zone (`Intl` throws `RangeError`).
   - The new route doesn't clash with the `startsWith('/reminders/')` routing at `api.js:46`.
   - Use `?` params, not string concatenation.
6. **README:** document the new fields and how the window works.
7. **Tests** (below).

**How the window works:**
- It's **[start, end)**: held from 22:00:00, released at 07:00:00.
- If `start > end` it wraps midnight. If `start < end` it's a same-day window (e.g. 13:00–14:00).
- No row means **no quiet hours**, which is today's behavior.
- Release can lag by **up to one tick** (30s, `config.json:2`).
- The check uses **the time of sending**, not `at`. A reminder due at 21:59 whose send fails and is retried at 22:00:30 is held too.
- Changes to the settings apply immediately, including to reminders already held.
- The message text doesn't change: both formatters print the original `at` (`format.js:3`, `legacy.js:4`).

**Why not store a postponed send time instead:** rewriting `due_ms` or `at` goes stale when settings change or DST shifts, and it changes what the message says. Checking on every tick costs almost nothing at under 5,000 rows in one process.

**Tests:**
- **quiet-hours** (window 22:00–07:00):
  - not held at 21:59; held at 22:00, 03:00 and 06:59; not held at 07:00
  - a same-day window
  - `Asia/Kolkata`
  - `America/New_York` across the 2026-03-08 and 2026-11-01 DST changes
- **scheduler:**
  - a 23:00 reminder is held at 23:00 and at 06:59, and is due at 07:00
  - a user with no settings is unaffected
  - another user's settings are ignored
  - the offset-330 regression test
- **tick:** a held reminder stays `sent = 0` and is sent after the window (using an injected `out`); an overlapping tick doesn't send twice.
- **api:** PUT, GET and DELETE, plus each 400 case.

**Decisions (my defaults; nothing is blocked on them):**

| Question | Default | Alternative |
|---|---|---|
| Which timezone defines the window | **IANA zone saved with the setting**, so the window stays at 22:00 local across DST | Reuse each reminder's fixed `tz_offset_min`: no new input, but the window moves 1h at DST and can differ between reminders |
| A reminder the user set inside the window (e.g. 23:00) | **Held** until 07:00, as the request reads | Send it anyway because the user picked that time, or warn when it's created |

**Not verified: I didn't run the tests**, because the Bash permission was denied. The step-0 bug is from reading the code and doing the arithmetic: 09:00 IST gives `due_ms` = 03:30Z, and the scheduler's extra 5h30 shift moves that to 22:00Z the day before, which is 03:30 IST.

**Also:**
- **SQL injection:** `searchReminders` pastes `userId` and `q` straight into the SQL string (`api.js:31`).
- **Restarts wipe everything** (`db.js:2`), and the new quiet-hours settings will be wiped too.
- **No auth:** any caller can change any user's quiet hours, as with the existing routes.

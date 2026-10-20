**Plan: check quiet hours at send time inside `tick()`. Nothing new is stored per reminder, and about 6 files change.** I didn't write any code. I also didn't run the tests: the `node` command needed approval, so it was skipped.

1. **Fix a bug first: the scheduler applies the UTC offset twice** (`src/scheduler.js:9`). `due_ms` is already UTC (`src/api.js:8`), so from the code, IST reminders fire **5.5 h early** and US reminders fire late. If this ships first, a 09:00 IST reminder fires at 03:30 IST, gets held, and goes out at 07:00. That would look like a quiet-hours bug.
2. **Add a new pure module, `src/quiet.js`:** `isQuiet(nowMs, settings)`. The start is inclusive and the end is exclusive. When start > end, the window crosses midnight.
3. **Store quiet hours per user in a new `quiet_hours` table** in `src/db.js`. There is **no users table** today; `user_id` is just a string on reminders.
4. **Store an IANA zone (`"Asia/Kolkata"`), not `tz_offset_min`.** Fixed offsets drift by an hour at DST. Node 20's `Intl` handles zones with no new dependency.
5. **Scheduler change:** load all quiet hours once per tick and skip users who are in their window. Skipped reminders stay `sent = 0` and go out on the **first tick after 07:00** (within 30 s).
6. **New API routes:** `PUT/GET/DELETE /users/:id/quiet-hours`, using `?` parameters only.
7. **Default I picked:** a reminder deliberately set inside the window (e.g. 23:00) is **held too**, as you described. Tell me if those should go out on time instead.

## Why check at send time, not shift `due_ms` at create time
| | Check at send time (recommended) | Shift `due_ms` when created |
|---|---|---|
| User changes their quiet hours | Applies right away | Old reminders keep stale times |
| New state | None | Must store the original and the shifted time |
| A failed send retried at 22:01 | Held automatically | Sent at night |
| Cost | One Map lookup per due reminder per tick | None |

## Steps, in order
1. **Fix the double offset (ship this on its own).**
   - Change `src/scheduler.js:9` to `r.due_ms <= nowMs` and correct the comment at line 7.
   - Add a test with `tz_offset_min: 330`. The current tests only use offset 0, which is why the bug passed.
   - No data migration: stored `due_ms` values are already correct. This **changes delivery times for every non-UTC user**, so announce it.
2. **`src/quiet.js`:**
   - `localMinuteOfDay(nowMs, tz)` via `Intl.DateTimeFormat(..., { timeZone, hourCycle: 'h23' })`
   - `isQuiet(nowMs, settings)`
   - `validateQuietHours(body)`
3. **`src/db.js`:**
   - Add a second row array plus three statements: `INSERT INTO quiet_hours` (upsert by `user_id`), `SELECT * FROM quiet_hours [WHERE user_id = ?]` and `DELETE FROM quiet_hours WHERE user_id = ?`.
   - `reset()` must clear it too.
   - Name the columns `quiet_start`/`quiet_end`, since `end` is a reserved word in real SQL.
4. **`src/scheduler.js` `tick()`:**
   - Build `Map(user_id → settings)` from one query.
   - Filter `dueReminders(...)` with `!isQuiet(nowMs, map.get(r.user_id))`.
   - Sort by `due_ms` so the 07:00 burst goes out in order. Rows currently come back in insertion order.
5. **`src/api.js` validation:**
   - `HH:mm` between 00:00 and 23:59.
   - `start === end` → **400**, because it could mean "never" or "all day".
   - Unknown `tz` → `Intl` throws `RangeError` → **400**.
6. **README:** document the new fields, routes and window rules.

## Window rules
- **22:00–07:00:** quiet when `t >= start || t < end`. So 22:00 and 06:59 are held, and **07:00 is sent**.
- **13:00–14:00:** quiet when `start <= t < end`.
- **No settings:** never quiet, which is today's behaviour.
- **DST:** local time is computed from the zone at `nowMs`, so the window stays 22:00–07:00 local all year.
- **Precision:** `nowMs` is captured at the start of the tick, and sends with retries take about 3 s each. A tick that starts at 21:59:50 could still send at 22:00:10. I'd accept that.

## Tests
- **New `test/quiet.test.js`:**
  - the boundaries above
  - a window that doesn't cross midnight
  - IST
  - `America/New_York` around **2026-03-08**, when DST starts
  - no settings
  - validation errors
- **`test/scheduler.test.js`:**
  - `tick(nowMs, { out })` at 23:00 local: nothing is sent and the row stays `sent = 0`.
  - The 07:00 tick sends it.
  - Another user with no quiet hours still gets their reminder at 23:00.
  - `tick` already takes `nowMs` and `out`, so no clock mocking is needed.
- **`test/api.test.js`:** PUT/GET/DELETE and the 400 cases.

**Also:**
- **SQL injection** in `searchReminders` (`src/api.js:31`): the query is built by string concatenation. It's unrelated to this change, but the new routes shouldn't copy it.
- **Quiet-hours settings won't survive a restart**, just like reminders (`README.md:16`, `src/db.js:2`). Include the new table when persistence is added.
- **Overlapping ticks:** `setInterval` doesn't wait for the async `tick` (`src/scheduler.js:26`). A large 07:00 burst with failing sends could overlap the next tick and **send twice**. This already exists today; an "already running" guard fixes it.
- Reminder times still use fixed offsets (`tz_offset_min`), so DST already shifts them by an hour. That's out of scope here.
- Held reminders need **no format change**. Both formatters already print the original time (`at`).

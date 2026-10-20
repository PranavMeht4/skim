Approach: when a reminder comes due, check the current time in the user's own timezone. If that falls inside their quiet window, skip the reminder on that tick. It stays unsent, so the first tick after the window ends sends it. Reminders don't need new columns.

**Step 0: fix a bug that would break this.** `src/scheduler.js:9` subtracts `tz_offset_min` again, but `api.js` already stores `due_ms` as UTC. The README agrees with `api.js`, and the comment on line 7 is wrong. As a result, an IST (330) reminder fires 5.5h early and US reminders fire late. The tests only use offset 0, so they don't catch it. Add a 330 test that fails, then compare `due_ms <= nowMs` directly.

**Changes by file**
- **`src/db.js`:** add a `quiet_hours` table with `user_id`, `start` and `end` (both `"HH:mm"`) and `timezone` (an IANA name). The stand-in only recognises statements it was written for, so add INSERT, SELECT and DELETE branches. Do updates as DELETE then INSERT.
- **`src/quiet.js` (new):** a pure `isQuiet(nowMs, settings)`.
  - Get the local minute of the day with `Intl.DateTimeFormat` using `timeZone` and `hourCycle: 'h23'`. The `hour12: false` option can return "24" at midnight.
  - The window is half-open, `[start, end)`. If `start > end` it wraps past midnight.
- **`src/scheduler.js`:**
  - Load all `quiet_hours` rows once per tick into a Map keyed by user.
  - Send only reminders that are due and not quiet, sorted by `due_ms` so held ones go out in order.
  - Keep the filter pure (for example `sendable(rows, quietByUser, nowMs)`) so it can be tested.
- **`src/scheduler.js` overlap guard (required):** `setInterval` doesn't wait for `tick` to finish. One failing send uses about 3s of retry backoff, so about 10 failing reminders at the 07:00 burst fill a whole 30s interval. The next tick then sends the same rows again. There is only one process, so an in-flight flag that skips the tick is enough.
- **`src/api.js`:** add `GET`, `PUT` and `DELETE` on `/users/:userId/quiet-hours`.
  - Validate the `HH:mm` format and reject `start == end`.
  - Check the timezone with `Intl`, which throws a RangeError on bad zones.
  - Use `?` parameters only.
- **`README.md`:** document the table and the endpoint.

**Decisions**
- **Check at send time, don't move `due_ms` when a reminder is created.** Edits or clearing quiet hours then apply on the next tick, with no rewriting of rows.
- **Store an IANA timezone with the settings, not a fixed offset.** A fixed offset is off by an hour for half the year in DST zones. `Intl` is built into Node 20, so this adds no dependency. Reminders keep their existing `tz_offset_min`.
- **Delivery after the window is within one tick** of the end time (30s).

**Tests**
- `quiet.test.js`:
  - 21:59 sends, 22:00 is held, 06:59 is held, 07:00 is released.
  - A window that doesn't wrap past midnight.
  - A user with no settings is never held.
  - An IST user with the server on UTC.
  - A New York user on both sides of the 2026-03-08 DST change.
  - Local midnight.
- `scheduler.test.js`:
  - The new 330 case for Step 0.
  - A reminder held across ticks, then sent on the first tick at or after the end.
  - Clearing quiet hours releases held reminders.
  - Two overlapping ticks don't send twice.
  - Held reminders go out in `due_ms` order.
- `api.test.js`: validation errors and the round trip (set, read back, clear).

**Not in scope:** digests or batching of held reminders, changing the message text, a "held" status in the API, and retries that run into the window.

**Separate issues to note**
- Data, including the new table, is still lost on restart. Include the table when that fix happens.
- `searchReminders` (`src/api.js:31`) builds SQL by joining strings, which lets a caller inject their own SQL. It's not part of this change, but it should be fixed.

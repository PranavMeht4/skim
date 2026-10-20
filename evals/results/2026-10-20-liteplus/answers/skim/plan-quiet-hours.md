**Plan: hold reminders when they would be sent, not when they're created.** On each tick, skip a user's due reminders while their local clock is inside the window. The first tick after the window ends sends them. There's no new queue and `due_ms` is never rewritten.

1. **Step 0: fix an existing bug first.** `scheduler.js:9` subtracts `tz_offset_min` from `due_ms`, but `due_ms` is already UTC (`api.js:8`, README, `api.test.js:12`). So **IST reminders fire 5.5h early and EST ones 5h late**: a 09:00 IST reminder fires at 03:30, inside a 22:00–07:00 window. The fix is `r.due_ms <= nowMs`, plus a test with a **non-zero offset** (the only existing test uses 0, `scheduler.test.js:6`).
2. **New per-user store:** a `user_settings` table (`user_id`, `quiet_start`, `quiet_end`, `time_zone`) in `db.js`. **No user entity exists today.**
3. **New pure module** `src/quietHours.js` with `isQuiet(nowMs, settings)`. It handles windows that cross midnight. The **start time is held and the end time is not** (22:00 held, 07:00 sent).
4. **Scheduler:** load all settings once per tick, filter with `isQuiet`, **sort by `due_ms`**, and add an **in-flight guard** so ticks can't overlap.
5. **API:** `PUT` / `GET` / `DELETE /users/:id/quiet-hours`.
6. **Decision, recommended:** store an **IANA time zone** (e.g. `Asia/Kolkata`) and read local time with `Intl`. A fixed offset puts the window an hour off for half the year in DST zones.
7. **Not verified:** I **didn't run the tests** (`node --test` needed approval, which this session can't grant). I also **didn't check** that Intl/ICU is available on your VM.

## How it works

```
tick(now) ──► SELECT unsent reminders ──► due? (due_ms <= now)
          └─► SELECT * FROM user_settings → Map(user_id → settings)
                         │
             isQuiet(now, settings[user])?
               yes → skip (stays sent=0; picked up by a later tick)
               no  → send in due_ms order → mark sent=1
```

"Held" isn't stored anywhere; each tick works it out again. So the following work with no extra state:
- **Editing quiet hours** after a reminder was created.
- **Disabling quiet hours**: held reminders go out on the next tick.
- **A send that fails all retries at 06:59**: it is held again, then sent after 07:00.

## Steps by file

| File | Change |
|---|---|
| `src/scheduler.js` | Step 0 fix at `:9`. `dueReminders(reminders, nowMs, settingsByUser)` filters by quiet hours and sorts by `due_ms`. `startScheduler` (`:26`) gets a `running` flag so a tick is skipped if the previous one is still going. |
| `src/quietHours.js` (new) | `validate({start, end, timeZone})`. `localMinutes(nowMs, timeZone)` using `Intl.DateTimeFormat` with `hourCycle: 'h23'`. `isQuiet`: if start < end, quiet when `start ≤ m < end`; if start > end (crosses midnight), quiet when `m ≥ start` or `m < end`. |
| `src/db.js` | `user_settings` branches next to the `reminders` ones (`:37`, `:50`, `:58`): an upsert by `user_id`, `SELECT *`, and `DELETE`. |
| `src/api.js` | 3 routes in `handle` (`:41`), using a path regex. Validation returns **400** for: a time that isn't `HH:mm`, an unknown zone (Intl throws `RangeError`), or `start == end`. Use **`?` params**; don't copy the string-built SQL at `:31`. |
| `README.md` | Document the route, the fields, the start-held/end-sent rule, and that delivery can be up to `tickSeconds` late. |

## Edge cases and choices

- **Burst at 07:00:** all of a user's held reminders go out together, in `due_ms` order. Up to 5,000 reminders in total is fine for one process.
- **Ticks overlapping is the real risk.** `setInterval` around an async `tick`, with 5 retries each, can run past 30s during the flush. The next tick then re-reads rows still at `sent = 0` and **sends them twice**. The risk exists today, but the 07:00 flush makes it much more likely.
- **A retry can run into the window:** 5 attempts back off about **3s ±2s** in total, so a send started at 21:59:58 can land at 22:00:03. Accept this.
- **Lateness:** delivery comes up to **30s** (`tickSeconds`) after the window ends.
- **`start == end`:** rejected at the API; `isQuiet` also returns false. **No settings:** nothing is held.
- **Restarts:** settings live in the same in-memory db as reminders, so a restart **loses quiet hours** and reminders would then send during the window. This is the existing persistence gap (README:16); quiet hours don't fix it.
- **Message wording:** a reminder arriving at 07:00 still says "(set for 23:30)". Optionally add "held for quiet hours" to `format.js` only. **Don't change `legacy.js`**: it's pipe-delimited and probably parsed by other systems.

## Tests

1. **`quietHours.test.js` (new):**
   - 22:00–07:00: 21:59 not held, 22:00 held, 06:59 held, 07:00 not held.
   - A same-day window, 13:00–14:00.
   - No settings: nothing held.
   - `Asia/Kolkata` (no DST).
   - `America/New_York` on **2026-03-08** and **2026-11-01** (the DST change days).
2. **`scheduler.test.js`:**
   - Regression for the non-zero offset.
   - `tick` at 23:00 local doesn't send; at 07:00 it sends in `due_ms` order.
   - Another user without quiet hours is unaffected.
   - An overlapping tick is skipped.
3. **`api.test.js`:**
   - A valid PUT returns 200; a bad time, bad zone or `start == end` returns 400.
   - GET returns the settings.
   - After DELETE, held reminders send on the next tick.

## Open questions (not blocking)

- Should some reminders be urgent and skip quiet hours?
- At 07:00, send one digest instead of the individual reminders?
- Show "held until 07:00" in `GET /reminders`?

**Also:**
- **SQL injection** in `searchReminders` (`api.js:31`): the query is built by string concatenation.
- **No auth:** any caller can set anyone's quiet hours, the same as the existing routes.

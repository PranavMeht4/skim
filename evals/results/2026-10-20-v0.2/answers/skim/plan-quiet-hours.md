**Plan: hold reminders at send time, but fix an existing scheduler offset bug first.**

1. **Step 0, blocking: fix the double offset** at `src/scheduler.js:9`. Today every reminder with a non-zero offset fires at the wrong time.
2. **Store quiet hours per user** in a new `user_settings` store in `src/db.js`, with fields `quiet_start`, `quiet_end` (`HH:mm`) and `time_zone` (an IANA name like `Asia/Kolkata`).
3. **Add routes** in `src/api.js`: `GET`, `PUT` and `DELETE /users/:id/quiet-hours`.
4. **Add a pure `inQuietHours(nowMs, setting)`** in a new `src/quiet-hours.js`.
5. **Filter in `tick`.** Skip a due reminder while its user is in quiet hours *now*. It stays unsent and goes out on the first tick after the window ends.
6. **Send held reminders in `due_ms` order, and guard against overlapping ticks** (`src/scheduler.js:25`).
7. **Tests** for east and west offsets, the midnight wrap, the window edges and users with no setting. Update the README fields table and routes.

**Step 0: the existing bug.** `due_ms` is already UTC (`api.js:16`, `api.test.js:12`, `README.md:37`), but `dueReminders` subtracts `tz_offset_min` a second time.
- An IST (330) reminder for 09:00 is stored as 03:30Z but fires at **22:00Z the night before**, 5.5h early. West offsets fire late.
- Tests pass because `scheduler.test.js` only uses offset 0.
- Fix: compare `due_ms` to now directly, and correct the wrong comment at line 7.
- Ship it on its own first. Quiet hours would hide it for some users: that 03:30 IST misfire falls inside 22:00–07:00 and would be held.

**Decisions**

| Question | Pick | Why |
|---|---|---|
| When to hold | **At send time** | No new reminder state. Edits to quiet hours apply to reminders already scheduled. |
| Rejected: move `due_ms` at create | no | Goes stale when quiet hours change, and overwrites the real due time. |
| Whose "local" time | **IANA zone on the setting** | One user's reminders can carry different offsets, so the same user could be quiet and not quiet at once. A fixed offset is 1h off for half the year under DST. Node 20's built-in `Intl` handles zones with no new dependency. |
| Check now or the due time | **Now** | Also holds failed sends that would otherwise retry at 03:00. |

**Tick flow**
```
tick(now)
  ├─ previous tick still running? → return
  ├─ unsent reminders + all user_settings (keyed by user_id)
  ├─ keep due_ms <= now
  ├─ drop if inQuietHours(now, setting[user_id])   ← held, stays sent = 0
  └─ sort by due_ms → send → mark sent
```

**Window rules**
- The window is `[start, end)` in the user's zone.
- If start > end, it wraps midnight: 22:00–07:00 holds 22:00 through 06:59.
- At exactly **07:00** reminders send.
- start == end means off.
- Return 400 for a bad `HH:mm` or a bad zone (`Intl` throws `RangeError` on an unknown zone).

**db.js is more work than "a new table".** Every branch is hard-coded to `reminders`, and INSERT maps params by position. It needs:
- its own rows array
- INSERT, SELECT and DELETE branches for settings
- `PUT` done as delete-then-insert, because there is no upsert
- `reset()` clearing the new rows, or the api tests leak state between runs

**API.**
- `PUT /users/:id/quiet-hours` with `{ start, end, timeZone }` returns 200.
- `GET` returns 200, or 404 if the user has no setting.
- `DELETE` returns 204.
- Wire the routes in `handle()` (`api.js:41`).

**Overlap guard.** This bug exists today, but quiet hours make it likely.
- `setInterval` (`scheduler.js:26`) starts a tick every 30s and doesn't wait for the last one.
- One failing send costs about **3s** of backoff (200+400+800+1600 ms, plus jitter).
- About 10 failing sends in the 07:00 burst push a tick past 30s. The next tick re-reads the same `sent = 0` rows and **sends them twice**.
- Fix: an in-flight flag. That is enough because there is only one process.

**Tests**
- `dueReminders` with offsets 330 and −300. These catch step 0.
- `inQuietHours` with a window that wraps midnight:
  - 06:59 is held
  - 07:00 sends
  - 21:59 sends
  - start == end means off
  - a user with no setting is never held
  - `Europe/London` in summer and in winter
- `tick`:
  - a held reminder sends on the first tick after the window
  - an overdue failed send is held
  - held reminders go out in `due_ms` order
  - an overlapping tick does not send anything twice
- API: PUT, GET and DELETE, plus 400 on bad input.

**Assumed:**
- Each held reminder is sent on its own at window end, with no digest.
- Quiet hours apply to every reminder, with no urgent bypass.
- The message still shows the original `at` time.

**Also:**
- `api.js:31` builds SQL by string concatenation, which becomes SQL injection on a real database.
- There is no auth, so anyone could set anyone's quiet hours.
- The in-memory db loses settings on restart, the same as reminders.
- Due times use fixed per-reminder offsets, so they still ignore DST.

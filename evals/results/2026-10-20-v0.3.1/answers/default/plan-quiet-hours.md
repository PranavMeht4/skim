I recommend checking quiet hours each time the scheduler runs, instead of changing a reminder's due time when it's created. If a reminder is due while the user is inside their quiet window, the scheduler just skips it. It stays unsent, so the first run after the window ends sends it, at most 30 seconds late. Nothing new needs storing, it survives restarts, and changing or turning off quiet hours affects reminders that are already waiting.

## First: fix an existing time-zone bug

Times are converted to UTC twice:
- `src/api.js:8` already turns the user's local time into UTC when it stores `due_ms`, which matches the README.
- `src/scheduler.js:9` then subtracts the user's UTC offset again (`due_ms - tz_offset_min * 60_000`). The comment above it at line 7 wrongly says `due_ms` is local time.
- Example: 09:00 IST is stored as 03:30Z, and the second subtraction moves it to 22:00Z the day before. So IST reminders fire 5.5 hours early, and users west of UTC get theirs late.
- The current tests only use offset 0, so they don't catch it.

Quiet hours depend on knowing the user's local time, so this needs fixing first. The fix is to compare `due_ms <= nowMs` directly, correct the comment, and add scheduler tests at +330 and −300. Since the database is in memory, there's no stored data to migrate.

## Steps

1. **Store quiet hours in `src/db.js`.** Add a `quiet_hours` table, one row per user: `user_id`, `start` and `end` as `"HH:mm"`, and `time_zone`. `db.js` only recognises statements for the `reminders` table, so it needs new branches to save (replacing any existing row for that user), read and delete. Keeping this in the database layer means it gets persisted along with reminders when that work happens.

2. **Add a quiet-hours check in `src/scheduler.js`.** A small exported function, `isQuiet(nowMs, settings)`:
   - It works out the user's local time of day with `Intl.DateTimeFormat` in 24-hour mode. This is built into Node 20, so no new dependencies.
   - A window that wraps past midnight, like 22:00–07:00, counts as quiet if the time is at or after 22:00, or before 07:00.
   - A window within one day counts as quiet from the start time up to, but not including, the end time.
   - So 22:00 exactly is held, and 07:00 exactly is sent.
   - `dueReminders` stays as it is.

3. **Use it when sending.** On each run, load all quiet-hours settings once (fine at under 5,000 rows) and skip due reminders for users who are currently in quiet hours. Also sort due reminders by `due_ms`, so a batch held overnight arrives in the order the user set them. Today they go out in creation order.

4. **Add API routes in `src/api.js`.** `PUT`, `GET` and `DELETE` on `/users/:userId/quiet-hours`, with a body like `{ start: "22:00", end: "07:00", timeZone: "Asia/Kolkata" }`. Return 400 for:
   - a time that isn't a valid `HH:mm`,
   - a start equal to the end,
   - an unknown time zone (`Intl` throws `RangeError` for these).

   Use `?` placeholders for values, not the string building that `searchReminders` uses.

5. **Tests:**
   - The window check: one window that wraps past midnight, one that doesn't, the exact start and end times, and a time zone with daylight saving such as `Europe/London` around its clock change.
   - There's no test for a scheduler run yet. Add one by passing a test `out` function to `tick`: a reminder due at 23:00 local isn't sent at 23:00 but is sent at 07:00.
   - A user with no quiet hours behaves exactly as today.
   - Removing quiet hours while a reminder is waiting releases it on the next run.
   - The API checks listed in step 4.

6. **README:** document the new routes, what the window means, and that `due_ms` is UTC.

7. **Optional, related:** `setInterval` starts a new run every 30 seconds even if the last one hasn't finished. A slow run can overlap the next one and send a reminder twice. With quiet hours, more reminders go out at once at 07:00, so this gets more likely. A simple guard that skips a run while the previous one is still going fixes it.

**No change:** `notify.js`, `format.js`, `legacy.js`. In particular, don't add fields to the pipe-separated legacy format, because something downstream may parse it.

## Decisions for you (my default in bold)

- **Which time zone defines "night":** **a named time zone (like `Europe/London`) saved with the user's quiet-hours setting.** The alternative is reusing each reminder's fixed `tz_offset_min`. That's wrong by an hour for half the year wherever clocks change, and different reminders from the same user can disagree. If all your users are in zones without clock changes, like IST, a saved fixed offset would also work.
- **Reminders the user set inside their own window** (say, medication at 23:00): **hold them, as you specified.** If that turns out to be wrong, add a per-reminder "send anyway" flag later.
- **Several reminders held overnight:** **send each one separately at 07:00, in order**, not as a combined digest.
- **Start equal to end:** **reject it with a 400**, rather than treating it as "quiet all day."

## Outside this change

- Settings will be lost on restart, the same as reminders today, until the persistence work the README mentions is done. Because nothing about "held" is stored, quiet hours don't add any new state to lose.
- `searchReminders` (`src/api.js:30-31`) builds its SQL by pasting in user input, which is an injection risk.
- Reminder times themselves still use fixed offsets, so a reminder set in winter for a summer date can be an hour off.

I couldn't run the existing tests or check the double-conversion bug in Node because both commands were denied permission. The bug finding comes from reading the code and working the example above by hand.

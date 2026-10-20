Creating a reminder stores it with a UTC due time, and a 30-second loop later prints it to stdout. The main problem is that the scheduler applies the user's timezone a second time, so anyone not on UTC gets their reminder at the wrong hour. There's also a gap before step 1: nothing in the running service can accept a create request.

## The path

1. **Entry point (there isn't one).** `src/index.js:6` only starts the scheduler. `handle()` in `src/api.js:41` is called only by the tests, and there is no HTTP server anywhere in `src/`. A real user has no way to create a reminder.
2. **Create.** `POST /reminders` goes to `createReminder` (`api.js:11`). It checks only that `userId`, `text` and `at` are present (`api.js:13`). `tzOffsetMin` defaults to 0.
3. **Convert to UTC.** `toUtcMs` (`api.js:7-9`) turns local `at` plus the offset into a UTC epoch. For example, 09:00 in India (+330) becomes 03:30Z. This matches the README and `api.test.js:10-14`.
4. **Store.** The INSERT (`db.js:37-48`) saves the row with `sent: 0` in an in-memory array, and the API returns 201.
5. **Tick.** Every `tickSeconds` (30s, `config.json`), `setInterval` (`scheduler.js:26`) runs `tick`. That selects every row with `sent = 0` (`scheduler.js:13`) and filters them with `dueReminders` (`scheduler.js:8-10`).
6. **Send.** Each due reminder goes, one at a time, through `withRetry` (5 attempts, about 200/400/800/1600ms backoff ± 500ms jitter, `retry.js:14`) into `send` (`notify.js:14`). That loads the formatter named in config and calls `console.log`. Config says `"legacy"`, so production prints `REMIND|u1|2026-03-01T09:00|call mum`. `format.js` is labelled "current" and is the one the tests check, but production doesn't use it.
7. **Mark sent.** On success, `UPDATE ... sent = 1` (`scheduler.js:17`). If all 5 attempts fail, it logs the error and the reminder is tried again next tick.

## What goes wrong

- **Timezone applied twice (main bug).** `due_ms` is already UTC, but `scheduler.js:9` subtracts `tz_offset_min` again. The comment above it wrongly says `due_ms` is wall-clock time. The effect follows directly from the code:
  - An India 09:00 reminder fires at 03:30 India time, 5h30m early.
  - A New York 09:00 reminder fires at 14:00 New York time, 5h late.
  - An India user who sets a reminder less than 5.5h ahead gets it on the very next tick.

  The tests miss this because `scheduler.test.js` hardcodes `tz_offset_min: 0`, and nothing tests create through to delivery. The fix is `r.due_ms <= nowMs`, plus a test with a non-zero offset.
- **Restart loses everything.** Pending reminders live only in memory (`db.js:4`), so a restart means they are never delivered. The README already notes this.
- **No format check on `at`.** Anything that isn't exactly `YYYY-MM-DDTHH:mm` gives a garbage or NaN `due_ms`, and the API still returns 201. A NaN reminder never counts as due, so it is silently never delivered.
- **Timing slack.** Delivery can be up to 30s late, and the first tick only runs 30s after boot.
- **Latent retry problems.** `console.log` effectively can't fail today, so these don't bite yet:
  - Sends run one after another, so one failing reminder's ~3s of backoff delays the rest.
  - A permanent failure is retried every tick forever.
  - `setInterval` doesn't wait for the previous tick, so a tick over 30s overlaps the next and can send the same reminder twice.

Off the delivery path: the search endpoint at `api.js:31` builds its SQL by pasting in user input, which allows SQL injection.

I couldn't run the end-to-end simulation because the command wasn't approved; the timezone numbers come from working through the code by hand. Want me to fix the double conversion and add the test?

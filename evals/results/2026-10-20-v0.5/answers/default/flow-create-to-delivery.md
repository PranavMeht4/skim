# How a reminder goes from creation to delivery

I worked this out by reading the code. I couldn't run anything (executing Node needed approval), so the timings below come from doing the arithmetic on the code, not from watching it run.

## 0. In production, nothing can create a reminder

`src/index.js:6` only starts the scheduler. The only thing that calls the request handler `handle()` (`src/api.js:41`) is the test suite. There is no HTTP server, and `db.js` keeps reminders in the process's memory. So the deployed process has no way to receive a reminder, and the scheduler checks an empty table every 30 seconds. Everything below describes what would happen once the API is wired into the same process.

## 1. Creating a reminder: `POST /reminders` → `createReminder` (`src/api.js:11-22`)

- **Required fields:** `userId`, `text` and `at` must be present (`api.js:13`). `tzOffsetMin` defaults to 0, which means UTC.
- **Converting to UTC:** `toUtcMs` (`api.js:7-9`) treats `at` as local wall-clock time and turns it into a UTC timestamp. For example, 09:00 in India (offset +330 minutes) becomes 03:30 UTC. This matches the README's definition of `due_ms` and is tested in `api.test.js:10-14`.
- **No format check on `at`:** anything `Date.parse` can't read (e.g. `"tomorrow 9am"`) produces `due_ms = NaN`. The API still returns 201, and that reminder never fires. A value with seconds, like `"2026-03-01T09:00:00"`, probably hits this too, but I couldn't confirm it.
- **Storage:** the insert stores the row with `sent: 0` (`db.js:37-49`).

## 2. Picking it up: `startScheduler` → `tick` (`src/scheduler.js:25-27`, `12-23`)

- `setInterval` runs `tick` every `tickSeconds` (30 by default, set in `config.json`). The first tick runs 30 seconds after startup, not immediately.
- Each tick loads every unsent row (`scheduler.js:13`) and filters it through `dueReminders`.
- So delivery lands 0–30 seconds after the due time. It can be later, because reminders are sent one at a time and a failing reminder earlier in the list holds up the rest.

## 3. The due check: this is where it breaks (`src/scheduler.js:8-10`)

```js
r.due_ms - r.tz_offset_min * 60_000 <= nowMs
```

`due_ms` is already in UTC, but this line subtracts the offset a second time:

| User's offset | Asked for | Fires at (UTC) | Fires at (local) | Result |
|---|---|---|---|---|
| 0 | 09:00 | 09:00Z | 09:00 | correct |
| +330 (India) | 09:00 | 22:00Z the day before | 03:30 | **5.5 hours early** |
| −300 (US Eastern) | 09:00 | 19:00Z | 14:00 | **5 hours late** |

The tests don't catch it because `scheduler.test.js` only uses offset 0, and the offset cases are tested in `api.test.js`. The comment at `scheduler.js:7` ("due_ms is the user's wall-clock time") contradicts the README, `toUtcMs` and its tests, so the scheduler is the side that's wrong. The fix is to compare `r.due_ms <= nowMs` directly and add a scheduler test with a non-zero offset. I haven't changed anything.

## 4. Sending (`scheduler.js:16` → `retry.js` → `notify.js`)

- **Retries:** `withRetry` makes up to 5 attempts, waiting about 200, 400, 800 and 1,600 ms between them, plus or minus up to 500 ms of random jitter. A reminder that always fails therefore holds up the loop for about 3 seconds.
- **Formatting:** `send` loads the formatter module named in config (`notify.js:6-12`). `config.json` sets `"legacy"`, so production uses the old pipe-separated format, not `format.js`, the format the code describes as current.
- **"Delivery":** the result is written with `console.log`:
  ```
  REMIND|u1|2026-03-01T09:00|call mum
  ```

## 5. After the send (`scheduler.js:17-21`)

- **Success:** `UPDATE ... SET sent = 1`. The row stays in the table but is never picked up again.
- **Failure:** the error goes to `console.error` and the row stays unsent, so every later tick retries it forever. There is no attempt limit, no dead-letter state and no alert. For example, a typo in `config.formatter` makes the module load fail on every attempt, so no reminder is ever delivered, and the only sign is the error log.

## Other risks along the path

- **Overlapping ticks:** `setInterval` doesn't wait for `tick` to finish. If a tick runs longer than 30 seconds, the next one loads the same unsent rows and can send them twice. This can't happen while sending is just `console.log`, but it will once sending goes over a network.
- **Restarts:** a restart loses every reminder. The README already says so.
- **Daylight saving:** `tz_offset_min` is stored once, when the reminder is created. If the due date falls on the other side of a daylight-saving change, the reminder fires an hour off.
- **Outside this path:** `searchReminders` (`api.js:29-32`) builds its SQL by joining strings with the user's input, which is a SQL injection risk.

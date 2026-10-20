**Create → in-memory row → 30s poll → retry → `console.log`. But the scheduler applies the timezone twice, so IST reminders fire 5.5h early and New York ones 5h late.**

1. **Nothing in production can create a reminder.** `index.js:6` only starts the scheduler, and `api.handle()` is only called from tests. The db lives in memory, so a create has to run in the scheduler's own process.
2. **Create** (`api.js:11-22`) requires `userId`, `text` and `at`. `tzOffsetMin` **defaults to 0 (UTC)**. `toUtcMs` (`api.js:7-9`) turns local `at` into a UTC `due_ms`, and **that part is correct**.
3. **Store** (`db.js:37-48`) pushes the row into an in-memory array with `sent: 0`. Everything is **lost on restart**.
4. **Poll** runs every 30s (`config.json:2`, `scheduler.js:26`). The first tick comes 30s after start, so delivery can be **up to ~30s late**.
5. **Due check** (`scheduler.js:9`) subtracts `tz_offset_min` **a second time**. That's the bug. **Fix:** `r.due_ms <= nowMs`.
6. **Send** (`scheduler.js:16` → `notify.js:14-17`) makes 5 attempts with ~3s of total backoff. It uses the **`legacy`** formatter from `config.json:3` and **prints with `console.log`**, e.g. `REMIND|u1|2026-03-01T09:00|call mum`. Printing that line is the whole "delivery".
7. **Mark sent** (`scheduler.js:17`) happens only after a successful send. On failure the error is logged and the next tick retries it, **forever**.

**Timezone bug, for a 9:00 local reminder:**

| User | Should fire (UTC) | Actually fires (UTC) | Effect |
|---|---|---|---|
| IST +330 | 03:30 | 22:00 the day before | **5.5h early** (03:30 local) |
| NY −300 | 14:00 | 19:00 | **5h late** (14:00 local) |
| UTC 0 | 09:00 | 09:00 | correct |

- `README.md:37` and `api.test.js:12-13` both treat `due_ms` as UTC already. So the comment at `scheduler.js:7` is stale and `api.js` is right.
- The tests **miss it** because `scheduler.test.js:6` sets the offset to 0 by default. A test with a nonzero offset would catch it.

**Silent failures on this path:**
- **Never delivered, still 201:** `at` must be exactly `YYYY-MM-DDTHH:mm`. Anything else, even `2026-03-01T09:00:00` with seconds, becomes `…09:00:00:00Z`. That parses to `NaN`, so the due check is never true.
- **Missing `tzOffsetMin`** is quietly treated as UTC.
- **No cap on retries:** a reminder that always fails (e.g. a bad formatter name) gets 5 attempts on every tick, indefinitely, with no dead-letter.
- **Possible double send (not happening today):** `setInterval` doesn't wait for the async `tick`, and nothing guards against overlap. If a tick runs past 30s (about 10 or more failing sends at ~3s of backoff each), the next tick picks up the same `sent = 0` rows. This doesn't happen today because `console.log` almost never fails.
- **The production format is untested:** `notify.test.js` only tests `format`, not `legacy`.
- **Backoff:** delays are 200/400/800/1600 ms with a fixed ±500 ms jitter (`retry.js:6-10`), so the first delay can come out negative, which means no wait.

**Not verified:** the command to run the tests and a simulation was declined. The timings and the IST/NY numbers come from reading the code. I haven't edited any files.

**Also (outside the create-to-delivery path):**
- **SQL injection** in search: `userId` and `q` are pasted straight into the query string (`api.js:31`).
- **No auth:** list and delete accept any `userId` or `id` (`api.js:25`, `api.js:37`).
- **DST drift:** the offset is fixed when the reminder is created. If a DST change falls between creation and the due date, it fires an hour off.
- The `formatter` setting in config is used directly as a dynamic `import()` path (`notify.js:8`).

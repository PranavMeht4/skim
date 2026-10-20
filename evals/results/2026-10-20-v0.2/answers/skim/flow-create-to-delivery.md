Reminders are saved, checked every 30s and printed to stdout. **Outside UTC they fire at the wrong time.**

1. **Wrong time:** the UTC offset is applied twice (`api.js:8`, then `scheduler.js:9`). IST fires **5.5h early** and EST **5h late**. Fix: change line 9 to `r.due_ms <= nowMs`.
2. **No way to create a reminder in production:** `index.js` only starts the scheduler. `handle()` has no HTTP server and only the tests call it.
3. **"Delivery" just prints a line** (`console.log`), in the old `legacy` format that `config.json:3` selects.
4. **Lost on restart:** the database is an in-memory array (`db.js:4`).
5. **Never fires, with no error:** an `at` that includes seconds still gets a 201 but is never sent.

**Not run:** I wasn't allowed to run the tests or a test script. All timings below come from reading the code.

**Flow**
```
POST /reminders {userId, text, at, tzOffsetMin}
  │  api.js:11  createReminder: 400 if userId/text/at missing
  ▼
toUtcMs(at, tz)          api.js:7    due_ms = at read as UTC − offset  ✓
  ▼
INSERT … sent=0          db.js:37    push to in-memory array → 201 + row
  ┆
  ┆  setInterval every 30s (config.json tickSeconds)   scheduler.js:25
  ▼
tick: SELECT sent = 0    scheduler.js:13
  ▼
dueReminders             scheduler.js:9   due_ms − offset ≤ now  ✗ 2nd shift
  ▼
withRetry(send, 5)       retry.js:14      200·2^n ms backoff, ±500ms jitter
  ▼
send → getFormatter      notify.js:14     import('./legacy.js'), cached
  ▼
out(format(r))           console.log → stdout
  ▼
UPDATE sent = 1          scheduler.js:17
```

**1. Create** (`api.js:11-22`)
- It needs `userId`, `text` and `at`.
- `tzOffsetMin` defaults to **0**, so leaving it out means the time is read as UTC.
- Nothing checks the format of `at`. `"2026-03-01T09:00:00"` turns into `"…:00:00Z"`, so `due_ms` becomes `NaN`. `NaN <= now` is always false, so the reminder never fires.

**2. Store** (`db.js:37`)
- The row goes into a plain array with `sent: 0`.
- A restart before the due time loses it, but `README.md:16` says reminders must survive restarts.

**3. Poll** (`index.js:6`, `scheduler.js:25`)
- It ticks every **30s**, and the first tick comes 30s after startup.
- So delivery lands up to 30s after the due time.

**4. Due check** (`scheduler.js:9`): this is where the bug is. For `at: 2026-03-01T09:00`:

| Offset | Stored `due_ms` | Fires at | Error |
|---|---|---|---|
| UTC 0 | 09:00Z | 09:00Z | none |
| IST 330 | 03:30Z | 22:00Z Feb 28 | **5.5h early** |
| EST −300 | 14:00Z | 19:00Z | **5h late** |

- The tests miss it because `scheduler.test.js:6` only uses `tz_offset_min: 0`.
- The comment at `scheduler.js:7` says `due_ms` is wall-clock time. That contradicts `README.md:37` and `api.js:5`, which both say it is already UTC.
- The fix also needs a test with a non-zero offset.

**5. Retry** (`retry.js:14`)
- It makes 5 attempts, with sleeps of 200, 400, 800 and 1600ms in between: about 3s in total.
- The ±500ms jitter can make the first delay 0.
- After 5 failures the error is logged and the reminder stays `sent = 0`. Every later tick tries it again, with no limit.

**6. Format and output** (`notify.js:14`)
- `config.json:3` selects `legacy`, so users get `REMIND|u1|2026-03-01T09:00|call mum`.
- The "current" format in `format.js` is only used in `notify.test.js`.
- There is no real delivery channel, only stdout.

**7. Mark sent** (`scheduler.js:17`): sets `sent = 1`, so the reminder is never sent again.

**Latent:** `setInterval` doesn't wait for `tick` to finish. If about 10 reminders fail slowly (~3s each), one tick runs past 30s. The next tick then picks up the same unsent rows, and those reminders get **sent twice**. This can't happen today, because `console.log` doesn't fail.

**Also:** `searchReminders` is open to SQL injection (`api.js:31`). It isn't on the create-to-delivery path.

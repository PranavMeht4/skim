**Create → store → 30s poll → send with retry → mark sent.**
- **Create:** `handle()` stores `at` as UTC `due_ms`, but no server calls it yet (`api.js:16`)
- **Poll:** every 30s, `tick()` loads unsent rows and keeps the due ones (`scheduler.js:13`)
- **Deliver:** prints a `legacy` line to stdout, 5 tries, then sets `sent = 1` (`scheduler.js:16`)
- ⚠ **Wrong time:** offset applied twice, so IST fires 5.5h early, EST 5h late (`scheduler.js:9`)
- **Also:** search builds SQL by joining strings, so it's injectable (`api.js:31`)

───

**Not run.** Running `node` here needed approval, so I ran nothing: no tests, no trace. I worked out the timing numbers by hand from `api.js:8`, `scheduler.js:9` and the assertion at `api.test.js:12`.

```
POST /reminders ──> handle()                          api.js:43
                     │ check userId, text, at present  api.js:13
                     │ due_ms = at (read as UTC) − offset   api.js:8
                     ▼
                   INSERT row { ..., due_ms, sent: 0 }  db.js:37 (memory)
                     :
setInterval 30s ──> tick()                              scheduler.js:26
                     │ SELECT * WHERE sent = 0          scheduler.js:13
                     │ keep if due_ms − offset <= now   scheduler.js:9  <- bug
                     ▼
                   withRetry(send, 5 attempts)          scheduler.js:16
                     │ send: import ./legacy.js, console.log   notify.js:14
            ┌────────┴─────────┐
         success           all 5 fail
            ▼                  ▼
   UPDATE sent = 1       console.error; row stays sent = 0
   scheduler.js:17       and is retried next tick, forever
```

**No entry point.** `src/index.js:6` starts only the scheduler. Nothing in `src/` calls `handle()`; only `test/api.test.js` does. So in production no reminder can be created, and the scheduler polls an empty store.

**Timezone bug.** `api.js:8` already converts to UTC, and README:37 agrees that `due_ms` is UTC. But the comment at `scheduler.js:7` says `due_ms` is wall-clock time, so line 9 subtracts the offset a second time.

| User offset | Wants (local) | Gets (local) | Off by |
|---|---|---|---|
| IST +330 | 09:00 | 03:30 | 5.5h early |
| EST −300 | 09:00 | 14:00 | 5h late |
| UTC 0 | 09:00 | 09:00 | exact |

The tests miss it because `scheduler.test.js:6` only uses `tz_offset_min: 0`. Suggested fix (not applied): `!r.sent && r.due_ms <= nowMs`, plus a scheduler test with offset 330.

**Other things on the path**
- **Latency:** a reminder fires up to 30s after it's due (`config.json:2`). The first tick runs 30s after startup, not at startup.
- **Output:** `config.json:3` picks `legacy`, so the user gets `REMIND|u1|2026-03-01T09:00|call mum` on stdout. `format.js`, marked "current", is used only in tests.
- **Bad `at`:** the code only checks that `at` is present. An `at` with seconds (`09:00:00`) or garbage makes `due_ms` NaN. That reminder is never due and never sent, and no error appears.
- **No give-up:** a failing send tries 5 times per tick, with about 1–5s of backoff in total. It then logs and starts again on the next tick, forever. There is no limit and no dead-letter store.
- **Overlapping ticks (latent):** `setInterval` doesn't wait for `tick()` to finish. If a real channel makes a tick run past 30s, the next tick picks up rows still at `sent = 0` and sends them twice. That can't happen with `console.log` today.
- **Restart:** rows live only in memory, so a restart drops every pending reminder (`db.js:2`; README:16 already says so).

**Off the path:** `api.js:31` pastes `userId` and `q` straight into the SQL string. The in-memory stand-in limits the damage today, but a real database would not. Use `?` parameters, as `listReminders` does.

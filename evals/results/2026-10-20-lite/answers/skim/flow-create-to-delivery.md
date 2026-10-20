**Non-UTC reminders fire at the wrong time, because the timezone offset is applied twice.** That's the main finding. The full flow from create to delivery is below.

1. **Double offset:** `api.js:8` already converts the time to UTC. Then `scheduler.js:9` subtracts `tz_offset_min` **again**.
2. **The scheduler is the wrong side.** Its comment (`scheduler.js:7`) says `due_ms` is local time. But `README.md:37` and `api.test.js:20` both say it's UTC.
3. **The fix:** compare `r.due_ms <= nowMs` at `scheduler.js:9`.

The effect, for a reminder at 09:00 local on 2026-03-01:

| User | Stored `due_ms` | Actually fires | Error |
|---|---|---|---|
| IST (+330) | 03:30Z | ~22:00Z **the day before** | **5.5h early** |
| New York (−300) | 14:00Z | ~19:00Z | **5h late** |
| UTC (0) | 09:00Z | 09:00Z | none |

The tests pass because `scheduler.test.js` only uses offset **0**.

## The flow

```
handle(req)                          api.js:41   ← only tests call this
  └─ createReminder                  api.js:11
       ├─ check userId/text/at are present (no format check)
       ├─ due_ms = toUtcMs(at, tzOffsetMin)    api.js:7  (correct UTC)
       └─ INSERT, sent=0             db.js:37    (in-memory array) → 201

index.js:6  setInterval every 30s (config.json:2)
  └─ tick()                          scheduler.js:12
       ├─ SELECT … WHERE sent = 0
       ├─ dueReminders()             scheduler.js:9   ← double offset
       └─ for each due reminder, one at a time:
            withRetry(send, 5 attempts)  retry.js:14
              └─ send()              notify.js:14
                   ├─ import('./legacy.js')   (name from config.json:3)
                   └─ console.log("REMIND|u1|2026-03-01T09:00|call mum")
            ├─ success → UPDATE sent = 1
            └─ all 5 fail → log error, stays sent=0, retried next tick
```

## What each step really does

1. **Nothing can create a reminder in production.** `handle()` is only called from `test/api.test.js`, and `index.js` starts only the scheduler. There's no HTTP server.
2. **Validation only checks that fields are present.** If `at` has seconds (`…T09:00:00`), `due_ms` becomes **`NaN`**. The API still returns **201**, and the reminder **never fires**. A non-numeric `tzOffsetMin` has the same effect.
3. **Storage is an in-memory array** (`db.js:4`). A restart **loses every pending reminder**, even though the README says the service must survive restarts.
4. **Delivery can be up to 30s late** because the scheduler only checks every 30 seconds.
5. **"Delivered" means printed to stdout.** `out` defaults to `console.log`, and `index.js` never changes it.
6. **Production uses the legacy pipe format** (`config.json:3` → `legacy.js:4`, which is marked TODO-remove). The newer `format.js` is only used in tests.
7. **Retry:** 5 attempts, with waits of 200, 400, 800 and 1600 ms between them, each shifted by up to **±500 ms** of random jitter. That's about 3s per reminder before it gives up.
8. **Failed reminders are retried every tick forever.** There's no attempt cap and no dead-letter.

I **couldn't run** the tests or my test script because permission was denied. Every number above comes from reading the code, not from running it.

**Also:**
- **SQL injection** in `searchReminders`: `userId` and `q` are pasted into the SQL string (`api.js:31`).
- **`DELETE` isn't limited to the user's own reminders** (`api.js:37`): anyone can delete any id.
- **Ticks can overlap:** `setInterval` doesn't wait for the previous `tick` to finish (`scheduler.js:26`). With `console.log` this can't double-send today. Once a real sender with slow failures is plugged in, the same reminder could be sent twice.

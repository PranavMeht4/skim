**How it works: `handle()` stores the reminder with a UTC `due_ms`, a 30 s tick finds it, and it is printed with `console.log`. But the tick subtracts the timezone offset a second time, so only UTC reminders fire on time.**

1. **Nothing can call "create" in the running service.** `src/index.js` starts only the scheduler and never imports `api.js`, so no server exposes `handle()`. Today you can create a reminder only by calling it in the same process.
2. **The create step itself is correct.** `createReminder` (`api.js:11`) requires `userId`, `text` and `at`, then converts the time with `toUtcMs` (`api.js:7`). That stores `due_ms` as a **UTC** epoch, which matches the README (`README.md:37`) and `api.test.js:12`.
3. **Reminders are stored in memory only** (`db.js:4`). Each row starts with `sent: 0` and **everything is lost on restart**, which the README already admits.
4. **The scheduler checks every 30 s** (`config.json` `tickSeconds`, `setInterval` at `scheduler.js:26`). The first check runs 30 s after start, so a reminder can go out up to about 30 s after its due time.
5. **Main bug, at `scheduler.js:9`: the offset is subtracted again** from a value that is already UTC. **IST reminders fire 5 h 30 m early and New York ones 5 h late.** **Fix:** `r.due_ms <= nowMs`, and add a test with offset 330.
6. **Failed sends are retried 5 times** with waits of 200, 400, 800 and 1600 ms, each ±500 ms of jitter. That is about **3 s for each failing reminder**, and reminders are handled **one at a time**. After the 5th failure the reminder stays unsent and is **retried on every tick forever, with no cap**.
7. **"Delivery" is just `console.log`** (`notify.js:14`), in the **legacy pipe format**, because `config.json` sets `"formatter": "legacy"`. The newer `format.js` is used only in tests. The reminder is marked sent only after the send succeeds (`scheduler.js:17`).

**Not run:** the Bash call needed approval, so I didn't run the tests or a simulation. The 5 h 30 m and 5 h figures are worked out by hand from `api.js:8` and `scheduler.js:9`.

```
handle(POST /reminders)          ← nothing calls this in production
  └─ toUtcMs(at, offset) → due_ms (UTC)          api.js:16
  └─ INSERT, sent=0 (in-memory)                  db.js:37
setInterval 30s → tick()                          scheduler.js:26
  └─ SELECT … WHERE sent = 0                      scheduler.js:13
  └─ dueReminders: due_ms − offset ≤ now  ✗ BUG   scheduler.js:9
  └─ withRetry(send, 5 attempts)                  scheduler.js:16
       └─ import ./legacy.js → console.log(...)   notify.js:8,16
  └─ UPDATE sent = 1                              scheduler.js:17
```

**Why the timezone bug went unnoticed:** the comment at `scheduler.js:7` says `due_ms` is wall-clock time, which contradicts the README. `scheduler.test.js` only uses `tz_offset_min: 0`, so the double subtraction never shows up.

**Also:**
- **An unparseable `at` is silently lost.** For example, `2026-03-01T09:00:00` with seconds still gets a **201**, but `due_ms` becomes `NaN`, so the reminder **never fires** and no error is logged.
- **A missing `tzOffsetMin` defaults to 0** (`api.js:12`), so the time is treated as UTC without warning.
- **Deleting `legacy.js`**, as its TODO suggests, without changing `config.json` would make every send fail and retry forever.
- **Ticks can overlap.** `setInterval` doesn't wait for the previous tick and there's no guard, so once a real transport that sometimes fails replaces `console.log`, the same reminder could be sent twice. This can't happen with `console.log` today.
- **The search endpoint is open to SQL injection:** it builds the query by joining strings (`api.js:31`). This is outside the create-to-delivery path.

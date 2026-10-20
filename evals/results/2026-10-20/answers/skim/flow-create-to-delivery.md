**Flow: API → in-memory store → 30s scheduler tick → retry → `console.log`. But the timezone offset is applied twice, so users outside UTC get reminders at the wrong time.**

I couldn't run any code: both the test run and my simulation needed approval. Everything below is traced by hand from the source.

```
POST /reminders {userId, text, at, tzOffsetMin}
  │  api.js:41 handle → :11 createReminder
  │  400 if userId/text/at missing; tzOffsetMin defaults to 0
  ▼
toUtcMs(at, tz)           api.js:7     due_ms = local − offset (correct UTC)
  ▼
INSERT, sent: 0           db.js:37     in-memory array
  ▼
setInterval every 30s     index.js:6 → scheduler.js:26
  ▼
tick: SELECT sent = 0     scheduler.js:13
  ▼
dueReminders              scheduler.js:9   due_ms − offset ≤ now  ✗ 2nd shift
  ▼
withRetry, 5 attempts     retry.js:14  waits 200/400/800/1600ms, ±500ms each
  ▼
send → import legacy.js   notify.js:14 (config.json:3 says "legacy")
  ▼
console.log("REMIND|u1|2026-03-01T09:00|call mum")
  ▼
UPDATE sent = 1           scheduler.js:17  only after a successful send
    on failure: log it, stay sent=0, retried next tick, with no limit
```

"Delivered" just means one line on stdout. The notify test only covers `format`, not the `legacy` formatter that config actually uses.

**Main bug: the offset is subtracted twice**
- **Cause:** `due_ms` is already UTC (`api.js:7`, README:37). `scheduler.js:9` subtracts `tz_offset_min` again, and the comment at `:7` is wrong.
- **Effect** for a 09:00 local reminder:

| User | Offset | Fires at (local) | Error |
|---|---|---|---|
| IST | 330 | 03:30 | **5h30m early** |
| EST | −300 | 14:00 | **5h late** |
| UTC | 0 | 09:00 | correct |

- **Why tests pass:** every test uses offset 0 (`scheduler.test.js:6`, and the `api.test.js` creates use the default).
- **Fix pointer:** `scheduler.js:9` should compare `r.due_ms <= nowMs`.

**Other gaps along the path**

| Gap | Where | Effect |
|---|---|---|
| **No way in** | `index.js:2` | Nothing listens or calls `handle()`, so the live store is always empty |
| Duplicate sends | `scheduler.js:26` | Ticks aren't awaited; ~10 failing sends × ~3s each push past 30s, and the next tick resends |
| Bad `at` accepted | `api.js:8` | `"…T09:00:00"` gives NaN `due_ms`, returns **201**, never fires |
| Restart loses all | `db.js:2` | README says the service must survive restarts |
| Endless retry | `scheduler.js:18` | No attempt cap or dead-letter: 5 tries every 30s, forever |
| DST | `api.js:12` | Offset is fixed at creation, so reminders after a DST change fire **1h off** |
| Latency | `config.json:2` | Up to 30s late; the first tick only runs 30s after startup |

⚠ **Risk:** `searchReminders` (`api.js:31`) builds SQL by joining `userId` and `q` straight into the query string, which is an SQL injection hole. It is not on the create→deliver path, and the in-memory store limits the damage today. It becomes exploitable as soon as a real SQL database replaces `db.js`.

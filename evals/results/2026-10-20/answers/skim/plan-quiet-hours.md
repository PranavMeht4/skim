**Plan: check quiet hours when sending, not when creating. Held reminders stay unsent, and the first tick after the window sends them. About 4h of work, no new infrastructure.**

```
tick, every 30s
  unsent rows ─► due? ──no──► skip
                  │yes
                  ▼
   user's quiet window covers now? ──yes──► hold (stays sent = 0)
   (local time = now + reminder.tz_offset_min)
                  │no
                  ▼
                send ─► sent = 1

22:00 ──────────── quiet ──────────── 07:00
   23:15 due → held               first tick ≥ 07:00 sends it
```

**Why at send time:** it needs no new column on reminders. Changing or removing quiet hours takes effect on the next tick. The existing "unsent rows get picked up next tick" loop already does the holding.

**⚠ Fix this first: the scheduler applies the UTC offset twice.**
- **Cause:** `due_ms` is already UTC (`api.js:16`, `README.md:37`), but `scheduler.js:9` subtracts `tz_offset_min` again. The comment at `scheduler.js:7` is wrong.
- **Effect today:** IST (330) reminders fire **5h30m early**, and US Eastern (-300) reminders fire **5h late**. Only UTC users get the right time.
- **Why tests miss it:** `test/scheduler.test.js:6` only uses `tz_offset_min: 0`.
- **Fix:** `r.due_ms <= nowMs`, plus tests at offsets 330 and -300.
- Quiet hours needs the same local-time math, so this has to land first.
- **Not run:** I found this by reading the code. My attempt to run the tests and a repro wasn't approved.

**Steps**
1. **Fix the offset bug** at `scheduler.js:9` and add the tests. ~15 min
2. **Add a pure helper**, `isQuiet(nowMs, tzOffsetMin, { start, end })`, in a new `src/quiet.js`. ~30 min
   - If start > end, the window wraps midnight: quiet when `t >= start || t < end`.
   - Start is inclusive and end is exclusive, so 22:00 is held and 07:00 sends.
   - Reject start == end, because it's ambiguous.
   - Use a positive modulo for minute-of-day so negative offsets work.
3. **Storage:** add a `quiet_hours` table (`user_id`, `start`, `end`) to `db.js` with upsert, select and delete. Write SQL that real SQLite also accepts. ~30 min
4. **Scheduler (`tick`):** load quiet hours once per tick and skip held reminders. Sort due reminders by `due_ms` so the 07:00 backlog goes out in order (today it goes in insertion order). ~30 min
5. **Stop overlapping ticks** in `startScheduler`: skip a tick while the previous one is still running. ~15 min
   - `setInterval` doesn't wait for the async `tick`. Two ticks can both read `sent = 0` and **send the same reminder twice**. The 07:00 backlog makes long ticks more likely.
6. **API in `api.js`**, following the existing style of putting `userId` in the body or query. ~45 min
   - `PUT /quiet-hours` with `{ userId, start: "22:00", end: "07:00" }` → 200
   - `GET /quiet-hours?userId=` → 200 or 404
   - `DELETE /quiet-hours?userId=` → 204
   - Return 400 for a bad `HH:mm` or for start == end. Use `?` params only.
7. **Tests** ~1h
   - `quiet.test.js`: wrapping window, same-day window, boundaries at 21:59, 22:00, 06:59 and 07:00, offsets 330 and -300
   - `scheduler.test.js`: a tick inside the window leaves `sent = 0`, and a tick after 07:00 sends it. Users without quiet hours behave as before.
   - `api.test.js`: PUT, GET, DELETE and validation
8. **README:** document the quiet-hours fields and rules. ~10 min

**No change to `notify.js` or the formatters.** Both message formats already show the original time (`at`).

**Decision: where the window's timezone comes from**

| | Reminder's `tz_offset_min` | IANA zone per user |
|---|---|---|
| New data | none | `tz` field |
| Correct across DST | ✗ (1h off after a clock change) | ✓ |
| Consistent with `due_ms` | ✓ | ✗ (reminders use fixed offsets) |

**Pick: the reminder's offset.** Reminders already have the same DST weakness, and Node 20's `Intl` can handle the switch to IANA zones later with no new dependencies.

❓ **Needs you:**
1. Timezone source: the reminder's offset (my pick) or an IANA zone per user?
2. After the window: send each held reminder separately (my pick), or one digest message at 07:00?

⚠ **Risk:**
- **Security (out of scope):** `searchReminders` builds SQL by joining strings with `userId` and `q` (`api.js:30-31`). The in-memory stand-in limits the damage today. Once `db.js` becomes a real database, which it must to survive restarts, this is a SQL injection hole. Switch it to `?` params before that swap.
- **Step 1 changes live behaviour:** every non-UTC reminder will start firing at a different (now correct) time. Stored rows need no migration, because `due_ms` was always saved as UTC.
- **Lost on restart:** `db.js` is in memory, so quiet-hours settings and held reminders are lost on restart, the same as reminders today. Persistence is out of scope.

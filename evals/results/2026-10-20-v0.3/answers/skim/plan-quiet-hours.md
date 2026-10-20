**Hold at send time:** skip a user's reminders while their quiet window is open.

1. **Fix the double offset first**, at `src/scheduler.js:9`. `due_ms` is already UTC (`src/api.js:16`), so today IST reminders fire **5.5h early** and US Eastern ones fire 5h late.
2. **Add a `quiet_hours` table** with `user_id`, `quiet_start`, `quiet_end` and `tz`. `src/db.js:37-58` only matches `reminders` statements, so it needs new branches for this table.
3. **Add the API** in `src/api.js:41`: `PUT`, `GET` and `DELETE` on `/users/:id/quiet-hours`. Validate `HH:mm` and the zone.
4. **Write a pure `isQuiet(nowMs, qh)`** and skip quiet users in `tick` (`src/scheduler.js:14`). Held rows stay `sent = 0`, so the first tick at or after 07:00 sends them.
5. **Add a re-entrancy guard** in `startScheduler` (`src/scheduler.js:26`). Without it, the 07:00 burst can overlap ticks and **double-send**.
6. **Tests:** windows that wrap midnight, the boundaries, release after the window, a user with no quiet hours, and offsets of ±.

**Not run:** `node --test` needed approval. I confirmed the offset bug only by reading `api.test.js:12` against `scheduler.js:9`.

**Also:**
- **SQL injection** at `src/api.js:31`: `q.userId` and `q.q` are pasted straight into the SQL string.
- Quiet-hours settings will be lost on restart, like everything else in `db.js`. This is the persistence gap the README already lists, not a new one.

**Why hold at send time and not move `due_ms` at create time**
- Settings changes reach reminders that already exist. Turning quiet hours off releases held reminders on the next tick. Moving `due_ms` breaks as soon as quiet hours are set or changed after a reminder is created.
- There is no new state. A reminder counts as held when it is due, unsent, and the user's window is open now.
- `due_ms` keeps meaning "the time the user asked for". The message still says "set for 23:30" (`format.js:3`, `legacy.js:4`), so the formatters don't change.

**Timezone**

| Option | Right across DST? | Cost |
|---|---|---|
| **IANA zone on the quiet-hours row** | yes | `Intl.DateTimeFormat` with `timeZone`; Node 20 ships full ICU, so no new dependency |
| Each reminder's `tz_offset_min` | no, the window shifts 1h twice a year | no new field, but one user's reminders can carry different offsets |

**Pick: IANA zone.** Due times would still use fixed offsets. That limitation already exists and is out of scope here.

**Rules**
- The window is start-inclusive and end-exclusive: a reminder at **22:00 is held**, one at **07:00 is sent**.
- If start > end, the window wraps midnight. If start < end, it falls within one day. If start == end, return 400.
- Delivery time decides, not due time. A reminder due at 21:59:50 that the 22:00:10 tick picks up is held overnight. So is a send that failed at 21:58.
- Release happens **within one tick (30s)** of 07:00 (`config.json:2`).
- Sort due rows by `due_ms` before sending. Today they go out in insertion order (`scheduler.js:13`).
- A send already inside `withRetry` when 22:00 arrives can finish about 3–5s into the window. That's acceptable.

**Why step 5 belongs in this change**
`setInterval` (`scheduler.js:26`) doesn't wait for the async `tick`. Each failing send spends about 3s across 5 attempts. If a tick runs past 30s, the next tick SELECTs the same `sent = 0` rows and sends them again. Quiet hours release a whole timezone's overnight reminders at one 07:00 tick, so 10 failing sends are enough to cause the overlap. The guard: skip a tick while the previous one is still running.

**Step details**
- **Step 1:** also fix the wrong comment at `scheduler.js:7`. Ship it as its own change, because it moves send times for every user outside UTC.
- **Step 2:** name the columns `quiet_start` and `quiet_end`, because `end` is a reserved word in SQL. Keep one row per user, which `PUT` replaces. `tick` loads all rows once into a Map; with ≤ 5,000 reminders, that needs no index.
- **Step 3:** the body is `{ start: "22:00", end: "07:00", tz: "Asia/Kolkata" }`. Return 400 for a bad `HH:mm`, for start == end, or for an unknown zone (`Intl` throws `RangeError`). Routing in `api.js:41-47` matches exact paths, so `/users/:id/quiet-hours` needs matching on both prefix and suffix.
- **Step 6:**
  - `scheduler.test.js`: due checks at +330 and −300. The current test uses only offset 0, which hides the bug.
  - `isQuiet`: 21:59 → no, 22:00 → yes, 06:59 → yes, 07:00 → no. Also a same-day window of 13:00–14:00 and a DST day in `America/New_York`.
  - `tick`, using `db.reset()` and a capturing `out`: a reminder due 23:00 is held at 23:00 and 03:00 and sent at the first tick at or after 07:00. A user with no settings is unaffected. Deleting settings mid-window releases on the next tick.
  - Two ticks running at once produce **one** send.
  - API: `PUT`/`GET`/`DELETE`, plus each 400 case.

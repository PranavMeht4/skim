**Two real bugs: every non-UTC reminder fires at the wrong time, and search is open to SQL injection.** This is a read-only review: I wasn't allowed to run `node --test` or a probe script, so I traced the times below by hand.

**1. Timezone offset is applied twice (biggest bug, but the fix goes in `scheduler.js`)**

```
09:00 IST (330) ─► toUtcMs ─► due_ms 03:30Z ✓ ─► scheduler.js:9 subtracts 330 min again
                                              ─► fires 22:00Z prev day = 03:30 IST
```

- `toUtcMs` (`api.js:8`) is **correct**. The README says `due_ms` is UTC.
- The bug is `scheduler.js:9`: `r.due_ms - r.tz_offset_min * 60_000 <= nowMs`. Its comment wrongly says `due_ms` is wall-clock time.
- Effect: IST reminders fire **5h30m early**. New York (−300) reminders fire **5h late**.
- **Fix:** change it to `r.due_ms <= nowMs` and fix the comment. Leave `toUtcMs` alone.
- **Why tests pass:** `scheduler.test.js` only uses offset 0, and no test runs create → `dueReminders` with a nonzero offset.

**2. SQL injection in search (`api.js:31`)**

`searchReminders` pastes `q.userId` and `q.q` straight into the SQL string. The stub DB happens to limit the damage today, though injected `AND` conditions already work. But the README says the service must survive restarts, so a real database is coming. Against a real database, a `userId` like `' OR 1=1 --` returns every user's reminders. A normal search such as `mum's` would also break the query.
**Fix:** use placeholders: `... WHERE user_id = ? AND text LIKE ?` with `[q.userId, '%' + q.q + '%']`. The stub already supports `?` with `LIKE` (`db.js:17-20`), so it's a drop-in change.

**3. Bad input gets a 201, then the reminder never fires (`api.js:8`, `:16`)**
- Only missing fields are checked. `toUtcMs` adds `:00Z`, so an `at` with seconds (`2026-03-01T09:00:00`), a `Z` suffix, or plain garbage should all give `due_ms = NaN`.
- A non-numeric `tzOffsetMin` also gives `NaN`. `NaN <= now` is always false, so the reminder never fires and nothing reports an error.
- If `tzOffsetMin` is left out it silently defaults to `0` (UTC), so an IST user's reminder comes 5h30m late.
- **Fix:** check `at` against `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$`, require an integer offset in [−720, 840], and return 400 unless `Number.isFinite(dueMs)`.

**4. Anyone can delete anyone's reminder (`api.js:37`)**
- Delete matches on `id` alone, and ids are sequential integers.
- How much this matters depends on what sits in front of `handle`. The repo has no auth layer and no HTTP server: `index.js` only starts the scheduler. Every route trusts the `userId` the client sends.

**5. Minor**
- `listReminders` and `searchReminders` throw a `TypeError` when `req.query` is missing, instead of returning 400.
- A missing `userId` returns `200 []` instead of 400.

❓ **Needs you:** should I apply fixes 1–3 and add a test that creates an IST reminder and checks it is due at 03:30Z? I'll run the tests if you approve `node --test`.

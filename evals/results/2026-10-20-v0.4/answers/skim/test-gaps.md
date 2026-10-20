**5 gaps matter; the worst hides a live timezone bug.** I found these by reading the code. I could not run the tests because Bash approval was denied.

- ⛔ **Timezones:** no test uses a nonzero offset; IST fires 5.5h early (`scheduler.js:9`)
- ⛔ **Search:** no tests; "milk and eggs" throws, and SQL is built from strings (`api.js:31`)
- ⚠ **Bad `at`:** no validation test; a NaN time returns 201 and never fires (`api.js:13`)
- ⚠ **tick():** no tests; ticks can overlap and send twice, but not yet (`scheduler.js:26`)
- ⚠ **Shipped format:** config uses `legacy`, but only `format` is tested (`config.json:3`)

───

**1. Timezones** (`scheduler.js:9`)

The only fixture sets `due_ms` by hand with `tz_offset_min: 0`, so subtracting the offset changes nothing. But `due_ms` is already UTC (`api.js:16`, README), and the scheduler subtracts the offset a second time. So a 09:00 IST (330) reminder fires at 03:30 local, 5.5h early. US Eastern (−300) fires 5h late. Every non-UTC user is affected.

The comment at `scheduler.js:7` is wrong and contradicts the README. Don't change the test to match it.

Test: build the reminder through `create`, not by hand.
```js
const { body } = create({ userId: 'u1', text: 'x', at: '2026-03-01T09:00', tzOffsetMin: 330 });
assert.equal(dueReminders([body], Date.parse('2026-03-01T03:29:00Z')).length, 0);
assert.equal(dueReminders([body], Date.parse('2026-03-01T03:30:00Z')).length, 1);
```
Fix: `r.due_ms <= nowMs`.

**2. Search** (`api.js:29`)

No test calls `/reminders/search`.

What breaks today:
- The fake DB splits WHERE on `AND`, ignoring case (`db.js:29`). So "milk and eggs" leaves a condition with no closing quote. `matcher` throws `unsupported condition`, and `handle` doesn't catch it.
- If `q` is missing, it searches for the literal text "undefined".
- A `%` typed by the user works as a wildcard.

After the DB swap: the README says the service must survive restarts, so a real DB is likely. Then this becomes SQL injection. `q = "%' OR user_id LIKE '%"` would return every user's reminders.

Tests: a term with "and", a term with `'`, a missing `q`, and a check that other users' rows never come back.
Fix: `query('... WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q}%`])`. Parameters skip the AND split, so this also fixes the crash.

**3. Bad `at`** (`api.js:13`)

The only test is for a missing field. `toUtcMs` appends `:00Z`, so an `at` that includes seconds (`2026-03-01T09:00:00`) or any non-ISO string gives `NaN`. `NaN <= nowMs` is always false. The API returns 201 and the reminder never fires. `tzOffsetMin: "+05:30"` does the same.

Test: a POST with seconds in `at` should get 400.
Fix: reject when `Number.isNaN(dueMs)`, and require an integer offset from −720 to 840.

**4. tick()** (`scheduler.js:12`)

`tick` and `startScheduler` have no tests. Nothing checks that a sent reminder gets `sent = 1`, that a failed one stays unsent, or that ticks don't overlap.

This can't happen today, because delivery is `console.log`. Once delivery is a network call:
- Each failing send takes about 3s: 5 attempts with 200+400+800+1600 ms of backoff.
- About 10 failures push a tick past 30s. `setInterval` then starts the next tick anyway.
- The new tick picks up rows the old one hasn't marked yet, so both send them.
- A reminder that always fails is retried on every tick forever. There's no attempt cap and no dead-letter, and it delays every reminder behind it.

Tests:
- `tick(now, { out })` sends once and sets `sent = 1`.
- A throwing `out` leaves the reminder unsent. `tick` hardcodes `{ attempts: 5 }`, so let it accept retry options or this test waits about 3s.
- `Promise.all([tick(), tick()])` sends each reminder once. This should fail now: both ticks select before either one marks the row.

Fix: skip a tick while one is still running, or schedule the next tick with `setTimeout` after the current one ends.

**5. Shipped format** (`config.json:3`)

The README calls `format.js` "current" and `legacy.js` "old". The test covers only `format`. Both config and `notify.js:14` default to `legacy`, so the format that actually ships has no test.
- `legacy` joins fields with `|` and doesn't escape them. A reminder text containing `|` makes the line ambiguous for whatever parses it.
- A typo in the config's formatter name makes every send fail. Those sends retry forever, and the only signal is a log line.

Tests: a fixed expected output for `legacy`, text containing `|`, and an unknown formatter name.

**Lower priority**

| Gap | Where | Risk |
|---|---|---|
| Jitter never exercised (`Math.random` pinned to 0.5) | `retry.js:8` | Delay can go negative or exceed `maxDelayMs` by 500 ms |
| `list` called with no `query` | `api.js:25` | Throws TypeError; a missing `userId` returns `[]` |
| `delete` has no ownership check | `api.js:37` | Anyone can delete any id; no test checks other rows survive |
| `index.js` config wiring | `index.js:6` | Untested; low risk |
| Persistence | `db.js:4` | README requires surviving restarts; not built, not tested |

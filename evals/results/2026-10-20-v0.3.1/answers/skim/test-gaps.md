**Biggest gap: nothing tests create → `tick` → deliver**, and it hides a real timezone bug. Ranked, most important first:

1. **Timezone applied twice.** `api.js:8` already converts to UTC, then `scheduler.js:9` subtracts `tz_offset_min` again. IST reminders fire **5.5h early** and US Eastern (-300) fires **5h late**. Scheduler tests only use offset 0 (`scheduler.test.js:6`), so they can't catch it.
2. **`tick()` has no tests** (`scheduler.js:12`). Nothing checks mark-as-sent, retry on the next tick, or no double send. Ticks can overlap (`:26`) and send the same reminder twice.
3. **Search has zero tests** and builds SQL by string concatenation (`api.js:31`). A search for "milk and eggs" would throw, and a quote in the input is SQL injection once a real DB arrives.
4. **The production formatter is untested.** `config.json:3` uses `legacy`, but tests only use `format`. Deleting `legacy.js`, as its own TODO says, would make every send fail with no test going red.
5. **An invalid `at` is accepted.** It returns 201 with `due_ms = NaN`, and the reminder is never delivered (`api.js:16`).
6. **Jitter is never exercised.** `retry.test.js:6` pins `Math.random` to 0.5. The first retry delay can go negative (200 − 500ms).

**Not run:** the node commands needed approval, so I have no coverage numbers and haven't confirmed the current tests pass. You can run `node --test --experimental-test-coverage test/`.

**One test covers 1, 2 and 4.** It fails today on the first assert:

```js
test('IST reminder is delivered once, at 09:00 local', async () => {
  reset();
  handle({ method: 'POST', path: '/reminders',
    body: { userId: 'u1', text: 'call mum', at: '2026-03-01T09:00', tzOffsetMin: 330 } });
  const lines = [];
  const opts = { formatter: config.formatter, out: (l) => lines.push(l) }; // config.json
  await tick(Date.parse('2026-03-01T03:29:00Z'), opts);
  assert.equal(lines.length, 0);
  await tick(Date.parse('2026-03-01T03:30:00Z'), opts);
  assert.equal(lines.length, 1);
  await tick(Date.parse('2026-03-01T03:31:00Z'), opts);
  assert.equal(lines.length, 1); // not sent twice
});
```

**1. Which side is wrong.** `README.md:37` says `due_ms` is already a UTC epoch, and `toUtcMs` agrees. Only the comment at `scheduler.js:7` disagrees. So the fix is `r.due_ms <= nowMs` at `scheduler.js:9`, not a change to `toUtcMs`.

**2. Duplicate sends.** Each failing send waits about **3s** in backoff (200+400+800+1600ms). During a notifier outage, about 10 failing reminders make one tick outlast the 30s interval. `setInterval` doesn't wait for the previous tick, so the next tick reads the same unsent rows. Meanwhile the old tick keeps working through its stale copy of the rows, so both ticks send them.
- Testability: `tick` hardcodes `{ attempts: 5 }` (`scheduler.js:16`), so any failure-path test waits ~3s in real time. Use `mock.timers` from `node:test`, or let `tick` accept retry options.

**3. Search.** The in-memory DB splits the WHERE clause on `AND` without regard to case (`db.js:29`), so "milk and eggs" would throw `unsupported condition`.
- `handle` has no try/catch (`api.js:41`), so the error escapes instead of becoming a 4xx/5xx.
- List and search also throw if `req.query` is missing (`api.js:25`, `:31`).
- Once persistence moves to a real DB, `' OR '1'='1` returns every user's reminders.
- Fix: `query('SELECT * FROM reminders WHERE user_id = ? AND text LIKE ?', [q.userId, `%${q.q}%`])`.

**4. Formatter.** An unknown or deleted formatter makes `import()` reject. Each reminder then retries 5 times per tick, every tick, forever. `index.js:6` doesn't check the formatter at startup.

**Also:**
- `DELETE /reminders/:id` has no ownership check (`api.js:36`), so any caller can delete any reminder.
- `config.json` still uses `legacy`, though `format.js` is labeled the current format.
- Surviving restarts (`README.md:16`) has no test, but it isn't built yet either.

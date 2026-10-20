**The gap that matters most hides a live bug. No test goes from "create" to "due", so every reminder from a non-UTC user fires at the wrong time.**

I couldn't run the tests: `node --test` needed approval, and this session is non-interactive. So there are no coverage numbers, and every finding below comes from reading the code. To get coverage yourself, run `node --test --experimental-test-coverage test/`.

| # | Gap | Impact |
|---|---|---|
| 1 | tz offset from api to scheduler | ✗ **live bug**: IST fires 5h30m early |
| 2 | `/reminders/search` has **0 tests** | throws on "and"; SQL injection later |
| 3 | bad `at` / `tzOffsetMin` input | returns 201, then **never fires** |
| 4 | `tick()` has **0 tests** | latent duplicate sends |
| 5 | `legacy` formatter (the one prod uses) | untested; `\|` in text breaks fields |
| 6 | `backoffDelay` / jitter | stubbed out in every test |

## 1. Timezone shift is applied twice

```
user picks 09:00 IST (offset 330)
api.js:8        due_ms = 03:30Z              ✓ UTC, as README.md:37 says
scheduler.js:9  due_ms - 330 min = 22:00Z the day before
                ─► fires at 03:30 IST, 5h30m early
offset -300 (US East) ─► fires 5h late
```

- **Cause:** the comment at `scheduler.js:7` says `due_ms` is wall-clock time. `README.md:37` and `api.js:8` say it is UTC.
- **Why tests pass:** `api.test.js:12` checks `toUtcMs` with 330 ✓. `scheduler.test.js:6` fixes the offset at **0**, so the second shift does nothing. No test spans both modules.
- **Fix:** change `scheduler.js:9` to `r.due_ms <= nowMs`.
- **Test to add:** create a reminder via `handle()` with `tzOffsetMin: 330`. At 03:29Z it should not be due; at 03:30Z it should be.

## 2. Search builds SQL by string concatenation (`api.js:31`)

- **Today:** the fake DB splits WHERE on `/\s+AND\s+/i` (`db.js:29`). So searching "bread and milk" (in any case) should make `handle()` throw:
  ```
  unsupported condition: text LIKE '%bread
  ```
- `index.js` never calls `handle()`, so the running service can't crash from this yet.
- **Later:** `README.md:16` requires the data to survive restarts, so `db.js` will become a real DB. Then `q` and `userId` can carry arbitrary SQL.
- **Test to add:** search text containing "and" and `'`. Assert through `queryLog` (`db.js:8`) that search uses `?` params. `queryLog` exists for tests, but no test uses it.

## 3. Bad input is accepted and then silently lost

`createReminder` only checks that fields are present (`api.js:13`).
- `at: "9am"` gives `Date.parse("9am:00Z")` = NaN, so `due_ms` is NaN. The API returns 201, but `NaN <= now` is **never** true, so the reminder never fires.
- `tzOffsetMin: "+05:30"` also gives NaN, with the same result.
- A missing `tzOffsetMin` silently defaults to UTC.
- Unverified: ISO strings with seconds or a trailing `Z` probably also give NaN, because the code appends `:00Z`.

## 4. `tick()` has no tests

- Untested: marking a reminder sent on success, leaving it unsent on failure, and the retry path.
- **Latent duplicate sends:** `setInterval` (`scheduler.js:26`) doesn't wait for the async tick.
  - Each permanently failing send spends about 3s in backoff (200+400+800+1600ms).
  - About 10 failures make one tick last over 30s.
  - The next tick then re-reads rows that are still unsent and sends them again.
- Today `send` is `console.log`, so this only bites once a real network sender lands.
- A reminder that always fails is retried every tick, forever.

## 5. The production formatter is untested

- Prod uses `legacy` (`config.json:3`; it's also the default at `notify.js:14`). `notify.test.js:8` tests only `format`.
- `legacy.js:4` joins fields with `|`. A text like "milk | eggs", or one with a newline, adds fields for whatever parses the output.
- A typo in the formatter name in `config.json` makes every send fail on every tick. The only sign is `console.error`, and there is no startup check.

## 6. Retry jitter is never exercised

- `retry.test.js:6` stubs `Math.random = 0.5`, so jitter is always 0.
- `backoffDelay` and its `maxDelayMs` cap have no direct tests.
- Jitter is a fixed ±500ms (`retry.js:4`) against a 200ms base, so the first retry delay ranges from −300ms to 700ms. The impact is low.

❓ **Needs you:** should I fix `scheduler.js:9` and add tests for #1–3? The other option is tests only, so you see #1 fail first.

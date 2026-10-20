A reminder gets **5 send attempts per scheduler tick**: the first try plus 4 retries. That number is set in `src/scheduler.js:16`:

```js
await withRetry(() => send(r, opts), { attempts: 5 });
```

- **The default is 3, but the scheduler overrides it.** `withRetry` in `src/retry.js:14` defaults to `attempts = 3`, but the scheduler always passes 5.
- **There's a growing pause between attempts.** It starts at 200ms and doubles each time (200, 400, 800, 1600ms), with some random variation added, and is capped at 10s (`src/retry.js:6`).
- **You can't change it through config.** `config.json` only holds `tickSeconds` and `formatter`, so changing the attempt count means editing the code.

**It never gives up for good.** If all 5 attempts fail, the scheduler logs `reminder <id> failed: ...` and leaves the reminder marked as unsent (`src/scheduler.js:18-21`). The next tick, 30 seconds later by default, picks it up again and makes another 5 attempts. There's no overall limit, so a reminder that keeps failing will be retried indefinitely.

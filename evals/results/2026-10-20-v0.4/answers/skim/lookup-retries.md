**5 attempts per tick, hard-coded at the call site** (`src/scheduler.js:16`).

- **Default ignored:** `withRetry` defaults to 3, but the scheduler passes 5 (`src/retry.js:14`)
- **Not configurable:** `config.json` has no retry setting, so changing it means a code edit
- **Never fully gives up:** after 5 failures the reminder stays unsent and every tick retries it (`src/scheduler.js:19`)
- **Tick rate:** a tick runs every 30s, set by `tickSeconds` in `config.json`, so a reminder that keeps failing gets 5 more tries every 30s, with no limit

───

**Backoff between the 5 tries** (`src/retry.js:6-9`): the base delays are 200, 400, 800 and 1600 ms, each with ±500 ms of random jitter. The first delay can come out negative (200 − 500), and `setTimeout` treats that as 0 ms. So the retries 1 and 2 can happen right after each other. One round of 5 tries takes about 3 seconds.

```js
// src/scheduler.js:16
await withRetry(() => send(r, opts), { attempts: 5 });
```

To get a real "give up" point, you would need an attempt counter on the reminder row, or a dead-letter state. Neither exists now. A failed reminder is logged with `console.error` and picked up again on the next tick.

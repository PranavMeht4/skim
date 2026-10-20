**5 attempts per tick**, hard-coded at `src/scheduler.js:16`: `withRetry(() => send(r, opts), { attempts: 5 })`.

1. That **overrides the default of 3** in `withRetry` (`src/retry.js:14`).
2. It is **not configurable**: `config.json` has no retry setting.
3. **It never gives up for good.** After 5 failures it only logs `reminder <id> failed: ...` (`src/scheduler.js:20`). The reminder stays `sent = 0`, so the next tick (every **30 s**) starts another 5 attempts. There's no overall cap.
4. **Backoff between attempts:** 200 → 400 → 800 → 1600 ms (`baseMs * 2 ** attempt`, capped at 10 s), each with **±500 ms jitter** (`src/retry.js:4-9`).

**Also:** the jitter is wider than the first delay, so a 200 ms delay can come out negative. `setTimeout` treats that as 0, so the first retry sometimes fires immediately.

**5 attempts per tick.** It's **hardcoded** as `{ attempts: 5 }` at `src/scheduler.js:16`, not in `config.json`.
1. **The default of 3** in `withRetry` (`src/retry.js:14`) is **overridden** by that 5.
2. **It never gives up for good.** After 5 failures it logs `reminder <id> failed: …`, but `sent` stays 0 (`src/scheduler.js:18-20`). The next tick tries again with another 5 attempts.
3. **The tick runs every 30s**, set by `tickSeconds` in `config.json:2` and passed in at `src/index.js:6`. So a reminder that keeps failing gets retried **every 30s forever**. There is no overall limit and no dead-letter step.
4. **Delay between attempts:** `200ms × 2^attempt` plus or minus **500ms of jitter**, capped at **10s** (`src/retry.js:6-9`). That gives roughly 0.2s, 0.4s, 0.8s and 1.6s before attempts 2–5.

To make the limit configurable, you'd add something like `sendAttempts` to `config.json` and pass it through `startScheduler` → `tick` → `withRetry`.

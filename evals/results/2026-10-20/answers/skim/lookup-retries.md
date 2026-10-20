**5 attempts per tick, hard-coded at `src/scheduler.js:16`. But it never fully gives up: a failed reminder is retried again on every later tick.**

```js
await withRetry(() => send(r, opts), { attempts: 5 });
```

| Where | What |
|---|---|
| `src/scheduler.js:16` | `attempts: 5`, the value actually used |
| `src/retry.js:14` | default `attempts = 3`, which line 16 overrides |
| `src/retry.js:6` | wait between tries: 200 ms base, doubling, capped at 10 s, ±500 ms jitter |
| `config.json` | has **no** retry setting (only `tickSeconds`, `formatter`) |

**After 5 failures:** the error is logged and `sent` stays `0` (`scheduler.js:18-20`). The next tick picks the reminder up again, so it gets another 5 attempts every 30 s with no overall limit.

⚠ **Risk:** a reminder that always fails is retried forever, and each failure logs `reminder <id> failed: ...` every 30 s.

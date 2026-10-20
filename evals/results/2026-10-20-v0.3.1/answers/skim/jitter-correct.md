**Jitter keeps many failed sends from all retrying at the same moment. The current implementation gets it wrong.**

**Why it's there** (`src/retry.js:2`): if a provider outage fails 1,000 reminders at once, plain backoff retries all 1,000 at exactly +200ms, then +400ms. The recovering provider gets hit in waves. Random offsets spread that load out.

**Is it right: no.** `src/retry.js:8` adds a **fixed ±500ms** no matter how long the delay is:
1. **Negative delays:** the first retry waits 200 ± 500, so −300 to 700ms. **30%** of first retries come out ≤0. Node raises those to 1ms, so they all fire together, which is the very thing jitter should prevent. For the second retry it's **10%**.
2. **The noise drowns out the backoff:** with the default `attempts = 3`, only those two waits ever run (200 and 400ms). ±500ms is bigger than both, so the second wait can be shorter than the first.
3. **The spread is too narrow at the cap:** at 10s, ±500ms is only ±5%, so long retries still bunch up.
4. **It goes over `maxDelayMs`:** jitter is added after the cap is applied, so a wait can reach 10,500ms. This only happens with `attempts ≥ 8`.

**Fix: full jitter.** Pick a random wait between 0 and the capped delay:
```js
export function backoffDelay(attempt, { baseMs = 200, maxDelayMs = 10_000 } = {}) {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.random() * exp;
}
```
With this, waits are never negative, never over the cap, and the spread grows with the delay. `JITTER_MS` can go. If you want a minimum wait, "equal jitter" works too: `exp / 2 + Math.random() * exp / 2`.

**Not run:** the percentages come from the formula, not a measurement. My command to measure them and run `node --test` was denied, so I ran neither.

**Also:**
- The tests never call `backoffDelay` directly. They also pin `Math.random = 0.5`, which makes this jitter zero, so they can't catch any of the above.
- After the fix, the `// no jitter` comment at `test/retry.test.js:6` becomes wrong, because 0.5 would mean half the delay. The tests would still pass, since they use `baseMs: 1`.
- Today `baseMs: 1` still waits up to about 500ms, because `JITTER_MS` doesn't scale with the delay. The fix removes this.

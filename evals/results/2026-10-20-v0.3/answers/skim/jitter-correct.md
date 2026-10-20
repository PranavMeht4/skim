**Jitter stops many failed sends from retrying in lockstep, but this version is wrong.**

It adds a **fixed ±500 ms** (`retry.js:4,8`) instead of scaling with the backoff:
1. **Negative delays.** `200 − 500 = −300 ms`. Node runs a negative `setTimeout` after about 1 ms, so the retry is effectively **immediate**.
2. **Default config is mostly noise.** With `attempts = 3`, only retries at attempt 0 and 1 sleep. Their delays are **[−300, 700)** and **[−100, 900)**, so **30%** and **10%** of them fire at once.
3. **Weak spread at long delays.** At the 10 s cap, ±500 ms is only ±5%, so retries stay bunched.
4. **Can exceed `maxDelayMs`**, up to **10 500 ms**.

**Fix:** use "full jitter": a random delay between 0 and the backoff, which also keeps it within the cap.
```js
const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
return Math.random() * exp;
```

**Also:**
- No test exercises the jitter. `test/retry.test.js:6` fixes `Math.random` to 0.5, which makes jitter exactly 0, and nothing tests `backoffDelay` directly.
- With full jitter, 0.5 gives `exp / 2` instead of "no jitter", so the comment on that line would need updating.

I didn't run anything: the numbers come from reading the code, because running the sampling script and test suite was denied.

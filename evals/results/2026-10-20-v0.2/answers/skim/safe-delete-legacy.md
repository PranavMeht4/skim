**No, it's in active use.** Production loads it by name, so a search for imports finds nothing.

- `config.json:3` sets `"formatter": "legacy"`. `src/index.js:6` passes it to the scheduler, then on to `send()`.
- `src/notify.js:8` loads the formatter with `` import(`./${name}.js`) ``. That turns `"legacy"` into `./legacy.js`.
- `src/notify.js:14` also defaults to `formatter = 'legacy'`.

**If you delete it:** every send fails with a missing-module error. `withRetry` tries 5 times, then logs `reminder N failed`. The reminder stays unsent and fails again on every tick, so **no reminders are delivered**.

**Tests won't catch it.** `test/notify.test.js:8` uses `formatter: 'format'`, and no test uses `legacy`. I didn't run the suite.

**To remove it safely:**
1. Set `config.json:3` to `"format"`.
2. Change the default at `src/notify.js:14` to `'format'`.
3. Delete `src/legacy.js` and its line at `README.md:28`.

⚠ **Risk:** The TODO in `legacy.js:2` says "once everyone is on the new format". That suggests something outside this repo reads the `REMIND|user|at|text` pipe format. I can't check that from here. Steps 1–2 change what that reader receives, so confirm with its owners first.

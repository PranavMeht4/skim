**No, it's not safe to delete.** Production uses it on every send.

1. **Production uses it:** `config.json:3` sets `"formatter": "legacy"`. `src/index.js:6` passes that to the scheduler, and from there it reaches `send()`.
2. **The import is dynamic:** `src/notify.js:8` loads `` import(`./${name}.js`) ``. No line ever says `import ... from './legacy.js'`, which makes the file look unused.
3. **It's also the fallback:** `src/notify.js:14` uses `formatter = 'legacy'` whenever no formatter is passed.
4. **What breaks:** every `send()` would throw module-not-found. `scheduler.js:16` retries 5 times, logs the error and leaves the reminder unsent. So **no reminders would go out**, and every tick would log errors.
5. **Tests won't catch it:** `test/notify.test.js:8` only tests `formatter: 'format'`. `npm test` would still pass. I didn't run the tests.

**To remove it safely:**
1. **Check that everything reading the old `REMIND|user|at|text` format has moved to the new one.** That's the condition in the file's own TODO (`legacy.js:2`). I can't check it from this folder; it's not a git repo and nothing here shows who reads the output.
2. Set `config.json:3` to `"formatter": "format"`.
3. Change the default at `notify.js:14` to `'format'`.
4. Delete `src/legacy.js` and its line in `README.md:28`.

**Also:** step 2 changes the output from `REMIND|u1|...|call mum` to `Reminder for u1: call mum (set for ...)`. Anything that parses the old pipe format will break as soon as config switches, even before the file is deleted.

**No — deleting `src/legacy.js` would break every reminder delivery in production.** (Only a static read; my attempt to simulate the deletion in a temp copy was blocked by the sandbox.)

1. **It's still the live formatter:** `config.json:3` sets `"formatter": "legacy"`, and `src/index.js:6` passes that value to the scheduler.
2. **It's loaded by name, so grep won't find it:** `src/notify.js:8` does `` import(`./${name}.js`) ``, and `src/notify.js:14` also **defaults** to `'legacy'`.
3. **The failure is silent:** each due reminder would retry **5 times** (`scheduler.js:16`), fail, get logged, and **never** be marked sent. It is retried every 30s tick, forever.
4. **Tests won't catch it:** `test/notify.test.js:8` only uses `formatter: 'format'`, so the suite passes either way.

**To remove it safely:**
1. **Confirm the consumers** of the pipe format (`REMIND|user|at|text`) have moved to the new format. The TODO at `legacy.js:2` says it's waiting on exactly that. I can't check this from the repo, and it isn't a git repo, so there's no history to check either.
2. Set `config.json` `"formatter"` to **`"format"`**. This changes the message format in production.
3. Change the default in `notify.js:14` to **`'format'`**.
4. Delete `src/legacy.js` and the line for it in `README.md:28`.

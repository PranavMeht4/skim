No, it isn't safe to delete it yet. `src/legacy.js` is the formatter running in production right now. Nothing imports it by name, so a search for imports makes it look unused.

**Why it's still live:**
- `src/notify.js:8` loads formatters by name at runtime: `` import(`./${name}.js`) ``.
- `config.json:3` sets `"formatter": "legacy"`, and `src/index.js:6` passes that through `startScheduler` into `send()`.
- `src/notify.js:14` also uses `'legacy'` as the default when no formatter is given.

**What would happen if you deleted it:** every `send()` would fail because the import can't find the file. `withRetry` would try 5 times and then `scheduler.js:20` would log `reminder N failed`. Each reminder would stay unsent and be retried on every tick. The process wouldn't crash, so nothing would look wrong except a stream of error logs, and no reminders would go out.

**The tests won't catch this.** The only `send()` test (`test/notify.test.js:8`) passes `formatter: 'format'`, and nothing exercises `legacy`. The suite would stay green after you delete the file.

**To remove it safely:**
1. Check that whatever reads these messages can handle the new format. The TODO in the file says to wait until "everyone is on the new format", and only you can confirm that.
2. Change `config.json` to `"formatter": "format"` and deploy. Watch for errors.
3. Change the default in `src/notify.js:14` to `'format'`.
4. Delete `src/legacy.js` and remove its line from `README.md:28`.

I haven't changed anything. I can make steps 2–4 if you confirm the readers have moved to the new format.

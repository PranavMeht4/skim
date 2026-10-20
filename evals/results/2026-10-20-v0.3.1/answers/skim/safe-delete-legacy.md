**No, don't delete it. `src/legacy.js` is the live production formatter.**

- `config.json:3` sets `"formatter": "legacy"`, and `src/index.js:6` passes that value into the scheduler.
- `src/notify.js:8` loads the formatter with `` import(`./${name}.js`) ``. That's why grep finds no `import ... from './legacy.js'` anywhere: the file name is built at runtime.
- `src/notify.js:14` also uses `'legacy'` as the default when no formatter is given.

**If you delete it:** every send fails with a module-not-found error. `withRetry` tries 5 times (about 3s per reminder), then `scheduler.js:18-20` logs the error and leaves the reminder unsent. That happens again on every 30s tick, so **no reminder is ever delivered**.

**Tests won't catch it.** `test/notify.test.js:8` uses `formatter: 'format'`, so nothing exercises `legacy`.

**Safe way to remove it:**
1. Set `"formatter": "format"` in `config.json:3`, if consumers accept the new message format. The file's TODO says they may not all be on it yet ("remove once everyone is on the new format").
2. Change the default in `notify.js:14` to `'format'`.
3. Delete `src/legacy.js` and its line in `README.md:28`.

**Not verified:** I didn't run the tests or try the delete on a scratch copy, because both commands were blocked by the permission prompt. All of the above comes from reading the code.

**Also:**
- **SQL injection** in search: `q.userId` and `q.q` are pasted straight into the SQL string (`src/api.js:31`).
- **Timezone applied twice:** `api.js:8` already converts `due_ms` to UTC, then `scheduler.js:9` subtracts the offset again. IST reminders fire **5.5h early**.

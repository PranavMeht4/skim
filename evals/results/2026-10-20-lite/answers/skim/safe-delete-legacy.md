**No: `legacy.js` is the live message format.** Deleting it would stop every reminder from being sent.

1. **It's selected in config:** `"formatter": "legacy"` (`config.json:3`).
2. **It's also the code default:** `formatter = 'legacy'` (`notify.js:14`). So removing the config line alone still uses it.
3. **Searching for imports won't find it:** it's loaded by name with `import(\`./${name}.js\`)` (`notify.js:8`). Searching for `legacy.js` imports finds nothing.
4. **The failure is quiet:** each send would fail with "module not found". `withRetry` tries it **5 times** (`scheduler.js:16`), then the error is logged and the reminder stays unsent (`scheduler.js:18-20`). The next tick tries it again, forever. The process **doesn't crash**.
5. **The tests won't catch it:** `notify.test.js:8` uses `formatter: 'format'`, so `node --test` stays green either way.

**To make deleting it safe:**
1. Confirm that whatever reads the output no longer expects the `REMIND|user|at|text` pipe format. The file's TODO says "once everyone is on the new format", and **I can't check that from this repo**.
2. Set `config.json:3` to `"format"` and change the default at `notify.js:14` to `'format'`.
3. Delete the file and remove the line for it at `README.md:28`.

**Not verified by running:** my sandbox blocked making a copy without the file, so all of this comes from reading the code.

**Also** (from reading only):
- **Time zone is applied twice:** `due_ms` is already UTC, but `scheduler.js:9` subtracts the offset again. IST reminders fire **5.5 h early**. The scheduler tests only use offset 0, so they miss it.
- **SQL injection:** `searchReminders` builds its query by string concatenation (`api.js:29-30`).
- **Ticks can overlap:** `setInterval` doesn't wait for the previous `tick` to finish, so a reminder can be sent twice.

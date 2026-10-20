**No, not safe: `legacy.js` is the formatter running in production right now.**

Nothing imports it by name, so a grep for imports finds no users. It is loaded at runtime from a file name built from config:

```
config.json "formatter": "legacy"
  └─► src/index.js:6      startScheduler({ formatter: config.formatter })
       └─► src/scheduler.js:16   send(r, opts)
            └─► src/notify.js:7  import(`./${name}.js`)  ─► ./legacy.js
```

- `src/notify.js:14` also uses `'legacy'` as the default when no formatter is passed.
- If you delete the file, each due reminder's `import()` fails. `withRetry` tries 5 times, the reminder stays unsent, and the same thing happens on every tick. **No reminders would be delivered.**
- The tests won't catch this. `test/notify.test.js:8` only uses `formatter: 'format'`. I read the tests but couldn't run them because the command needed approval.

**To remove it safely:**
1. Set `"formatter": "format"` in `config.json`.
2. Change the default in `src/notify.js:14` to `'format'`.
3. Delete `src/legacy.js` and its line in `README.md:28`.

⚠ **Risk:** the message format changes from `REMIND|u1|2026-03-01T09:00|call mum` to `Reminder for u1: call mum (set for …)`. Anything downstream that parses the pipe-delimited output will break. Nothing in this repo shows who reads that output.

❓ **Needs you:** check that no consumer depends on the `REMIND|…` format, then say if you want me to make the 3 changes.

**Two unrelated bugs I noticed while reading:**
- **`src/scheduler.js:9`:** the README says `due_ms` is already UTC, but the code subtracts the timezone offset again. That would send IST reminders 5h30m early.
- **`src/api.js:31`:** the search query is built by pasting `q.userId` and `q.q` into the SQL string, which allows SQL injection.

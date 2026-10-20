**No. Production still uses it, through a dynamic import that grep can't see.**
- **Live config:** `config.json` sets `"formatter": "legacy"` (config.json:3)
- **Loaded by name:** `notify.js` runs `import(\`./${name}.js\`)`, so no static import shows up (src/notify.js:8)
- **Default too:** `send()` falls back to `'legacy'` when no formatter is passed (src/notify.js:14)
- **Silent break:** if you delete it, every send throws and gets caught, so no reminder is ever sent
- **Tests won't catch it:** the only notify test uses `formatter: 'format'` (test/notify.test.js:8)

───

**What happens if you delete it now**

```
index.js → startScheduler({ formatter: "legacy" })
  → tick → withRetry(send, 5 attempts)
    → import("./legacy.js") fails ×5 (backoff ~0.2s → 3.2s)
      → catch logs "reminder <id> failed: Cannot find module ..."
        → row stays sent = 0 → retried on every tick, forever
```

The process stays up and the only symptom is error lines in the log. No reminders go out.

**To remove it safely**
1. Change `config.json:3` to `"formatter": "format"`.
2. Change the default at `src/notify.js:14` to `'format'`.
3. Delete `src/legacy.js` and its line in `README.md:28`.

**Not verified:** the file's TODO says "remove once everyone is on the new format." That points to downstream consumers that parse the pipe-delimited `REMIND|user|at|text` string. Nothing in this repo shows who they are or whether they've moved to the new format. Check with them before switching the config.

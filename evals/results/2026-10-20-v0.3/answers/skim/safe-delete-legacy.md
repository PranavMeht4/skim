**No, not yet.** Production loads it by name, so grepping for `legacy.js` finds nothing.

```
config.json:3        "formatter": "legacy"
  → index.js:6       startScheduler({ formatter: config.formatter })
  → scheduler.js:16  send(r, opts)
  → notify.js:8      await import(`./${name}.js`)   → ./legacy.js
```

`notify.js:14` also uses `'legacy'` as the default formatter.

**If you delete it now,** every send fails with a module-not-found error. Each one is retried 5 times (`scheduler.js:16`), then caught and only logged (`scheduler.js:20`). The service keeps running, but **no reminders are delivered**, and they pile up unsent.

**Tests won't catch this.** `test/notify.test.js:8` only exercises `formatter: 'format'`.

**To remove it safely:**
1. Set `config.json:3` to `"formatter": "format"`.
2. Change the default at `notify.js:14` to `'format'`.
3. Remove the line at `README.md:28`.
4. Delete `src/legacy.js`.

⚠ **Risk:** Step 1 changes what the service outputs. The old format is `REMIND|u1|<at>|<text>`; the new one is `Reminder for u1: <text> (set for <at>)`. The TODO at `legacy.js:2` says to remove the file "once everyone is on the new format", so something downstream may still parse the pipe format. The repo can't tell me whether those consumers have moved, so check with them first.

**Not verified:** I didn't run the deletion, even on a temp copy, because that command was blocked. The failure above is read from the code, not observed.

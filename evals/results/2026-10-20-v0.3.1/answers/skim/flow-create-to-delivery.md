**Create → store → 30s tick → due check → send → mark sent.** Two of these steps are broken.

1. **Create:** `createReminder` (`api.js:11`) requires `userId`, `text` and `at`. `tzOffsetMin` defaults to 0. `toUtcMs` (`api.js:7`) turns the local time into a UTC `due_ms`. **Broken:** nothing outside the tests calls `handle()`. `index.js` starts no HTTP server, so the running service has no way to receive a reminder.
2. **Store:** the row is put in memory with `sent: 0` (`db.js:38`), and the API returns 201.
3. **Tick:** every **30s** (`config.json:2`), `setInterval` runs `tick` (`scheduler.js:26`), which loads all `sent = 0` rows (`scheduler.js:13`).
4. **Due check:** `dueReminders` (`scheduler.js:9`) subtracts the timezone offset **a second time**. **Broken:** every user outside UTC gets the reminder at the wrong time (table below).
5. **Send:** the send is retried up to **5 times** (`scheduler.js:16`), with waits of about 200/400/800/1600 ms ±500 ms (`retry.js:6`). The configured formatter is `legacy` (`config.json:3`), so the message looks like `REMIND|u1|2026-03-01T09:00|call mum`.
6. **Deliver:** "delivery" is one `console.log` line on stdout (`notify.js:16`). Nothing reaches the user.
7. **Mark sent:** `UPDATE ... sent = 1` (`scheduler.js:17`). If the send fails, the error is logged and the reminder stays unsent. It is retried on every tick **forever**, with no cap.

**The timezone bug in step 4**, for a user who picks 09:00 local on 2026-03-01:

| User | `due_ms` (correct) | Scheduler checks | Fires at |
|---|---|---|---|
| IST +330 | 03:30Z | 22:00Z, day before | 03:30 IST, **5.5h early** |
| UTC 0 | 09:00Z | 09:00Z | 09:00, correct |
| EST −300 | 14:00Z | 19:00Z | 14:00 EST, **5h late** |

`api.js` and `README.md:37` both say `due_ms` is already UTC, so the comment at `scheduler.js:7` is the wrong part. Fix: `!r.sent && r.due_ms <= nowMs`. `scheduler.test.js` passes only because it tests offset 0 alone.

**Timing:** a reminder goes out 0–30s after it is due, plus any retry waits. Each tick sends reminders one at a time.

**Also:**
- A restart loses every reminder not yet sent, because rows live only in memory (`db.js:4`). The README already says so.
- **Overlapping ticks can send twice.** Nothing waits for `tick` to finish. About 10 reminders that keep failing (~3s each) push one tick past 30s. The next tick then reads rows the first tick hasn't marked sent yet.
- The format of `at` is not checked. `"2026-03-01T09:00:00"` (with seconds) probably gives a `due_ms` of NaN. That reminder would never be due, and no error would appear.
- `format.js` is labelled the "current" format, but only the tests use it.
- Search builds its SQL by joining strings (`api.js:31`), so it is open to injection once a real database is used.
- Delete doesn't check who owns a reminder, so any user can delete any id (`api.js:35`).

**Not verified:** I couldn't run the tests or a timing script, because running `node` needed approval that wasn't granted. Everything above comes from reading the code, and I worked out the timezone numbers by hand.

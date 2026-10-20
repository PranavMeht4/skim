The time zone offset is applied twice: once when the reminder is saved, and again when the scheduler checks whether it's due.

**1. When a reminder is saved, it's converted to UTC.** In `src/api.js:7-9`:
```js
export function toUtcMs(at, tzOffsetMin) {
  return Date.parse(`${at}:00Z`) - tzOffsetMin * 60_000;
}
```
For an India user setting 09:00 (offset 330 minutes), this gives 03:30 UTC. That's correct, and `test/api.test.js:12` checks for exactly that value. It's then stored as `due_ms` (`src/api.js:16-19`).

**2. The scheduler subtracts the offset again.** In `src/scheduler.js:7-9`:
```js
// due_ms is the user's wall-clock time, so shift it back to UTC with their offset.
...r.due_ms - r.tz_offset_min * 60_000 <= nowMs
```
The comment is wrong: `due_ms` is already UTC, not the user's local time. So the reminder fires at 03:30 − 5h30m = 22:00 UTC the day before, which is 03:30 in India, 5½ hours early. That's the "about 5 hours" users are reporting.

**Why only some users are affected:** UTC users have an offset of 0, so subtracting it twice changes nothing. Anyone with a non-zero offset is off by their full offset. Users west of UTC get theirs late: someone on US Eastern (−300) gets a reminder 5 hours late.

**Why the tests pass:** every scheduler test and every API create test uses an offset of 0, so nothing exercises the double subtraction.

**The fix** is to compare the stored UTC time directly in `src/scheduler.js:9`:
```js
return reminders.filter((r) => !r.sent && r.due_ms <= nowMs);
```
Also correct the comment on line 7, and add a scheduler test with `tz_offset_min: 330` so this can't come back.

I traced this by reading the code. The script I tried to run to simulate an India and a UTC reminder through the API and scheduler was declined, so I haven't executed anything or changed any files. I can make the fix and add the test if you'd like.

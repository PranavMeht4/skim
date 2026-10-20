# reminder-service

Stores reminders and delivers them at the time the user asked for.

## Run

    node src/index.js        # starts the scheduler loop
    node --test test/        # runs the tests

Node 20, ES modules, no dependencies.

## How it is deployed

- One small VM, **one process**. There is no second instance and no plan for one.
- About 2,000 reminders today, expected to stay under 5,000.
- Must survive restarts (it does not yet: `src/db.js` keeps everything in memory).
- No new infrastructure (no database server, no queue) unless there is a strong reason.

## Layout

    src/index.js      entry point, reads config.json, starts the scheduler
    src/api.js        request handler: create, list, search, delete reminders
    src/db.js         in-memory stand-in with a small SQL-like interface
    src/scheduler.js  finds due reminders and sends them
    src/retry.js      retry with exponential backoff
    src/notify.js     formats and delivers one reminder
    src/format.js     current message format
    src/legacy.js     old message format
    test/             node:test tests

## Reminder fields

| Field | Meaning |
|---|---|
| `at` | local wall-clock time the user picked, `YYYY-MM-DDTHH:mm` |
| `tz_offset_min` | the user's UTC offset in minutes, east positive (IST is 330) |
| `due_ms` | the same moment as `at`, as a UTC epoch in milliseconds |

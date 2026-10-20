I recommend **SQLite through Node's built-in `node:sqlite` module**, with the runtime moved to a current Node LTS (24). If the VM has to stay on Node 20, use a JSON file that is rewritten safely on every change instead. Nothing is changed yet; this is the comparison.

## What the README already decides

One process, under 5,000 reminders, no new infrastructure, no dependencies. That rules out Postgres, Redis or a queue: they're a new server to run with no benefit at this size. Four options are left:

| Option | Runs on Node 20? | New dependency? | Survives a crash mid-write? | Work needed |
|---|---|---|---|---|
| **A. JSON file**, rewritten on each change | Yes | No | Only if done carefully (write a temp file, fsync it, rename it over the old one) | Small. The home-made SQL matcher in `db.js` stays |
| **B. `node:sqlite`** (built in) | **No**, needs Node 22.13+ (24 is best) | No | Yes, SQLite handles it | Small. `db.js` shrinks to about 30 lines and the matcher is deleted |
| **C. `better-sqlite3`** | Yes | Yes, a compiled native package | Yes | Small |
| **D. Log of changes, replayed on startup** | Yes | No | Yes, if done well | More than A for no gain at this size. Rejected |

## Why B

- **The code already speaks SQL.** `api.js` and `scheduler.js` send parameterized SQL through `query(sql, params)`, and `db.js:1` calls itself a "stand-in for a SQL database". With real SQLite, those statements mostly just run (the insert needs `RETURNING *`).
- **SQLite gets crash-safety right.** With A, safe saving, keeping the next id across restarts, and recovering from a half-written file are all mine to write and test.
- **No dependency.** C gives the same engine but brings a compiled native package, which breaks the "no dependencies" rule.
- **The Node upgrade is probably due anyway.** I believe Node 20 reached end-of-life on 2026-04-30, so needing Node 22+ shouldn't count against B. I couldn't confirm the date here (web search was blocked).
- **The catch:** the last I knew, `node:sqlite` was still marked experimental and printed a warning at startup. I couldn't check its current status. The risk is limited: the engine underneath is standard SQLite, and the Node-side calls are confined to `db.js`.

**When to pick A instead:** if the VM can't leave Node 20. Prefer A over C there, since it keeps the no-dependency rule.

## Things to fix in the same change

1. **Search is open to SQL injection** (`api.js:30-31`). It glues `userId` and `q` straight into the SQL text. The fake database limits the damage today, but with real SQLite a search like `' OR '1'='1` would return every user's reminders. The fix: `WHERE user_id = ? AND text LIKE '%' || ? || '%'`.
2. **Tests need their own database.** `api.test.js` calls `reset()` before each test. The database file path should be configurable, so tests use an in-memory or temporary database and never touch the real file.
3. **Delivery becomes "at least once".** If the process dies after sending a reminder but before marking it sent, it is sent again after the restart. Reminders that came due while the service was down all go out on the first check after it starts. A related existing risk: `setInterval` doesn't wait for the previous check to finish, so a check slowed by retries can overlap the next one and send the same reminder twice. That's worth guarding once a backlog after restart is possible.
4. **Raise `engines`** in `package.json` to match the new Node version.

**A separate bug I noticed:** `scheduler.js:9` subtracts the timezone offset again, even though `api.js` already stored `due_ms` in UTC. So reminders fire 5.5 hours early for India and several hours late for the US. Tests miss it because they only use offset 0. It's not a storage problem, but it's a one-line fix.

I'd like to implement B, including the search fix and a test that restarts the database and checks the reminders are still there. One question first: which Node version does the VM run, or can it move to 24?

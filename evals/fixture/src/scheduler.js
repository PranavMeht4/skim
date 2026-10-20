// Finds reminders that are due and sends them.
import { query } from './db.js';
import { send } from './notify.js';
import { withRetry } from './retry.js';

// A reminder is due once its time has arrived and it has not been sent.
// due_ms is the user's wall-clock time, so shift it back to UTC with their offset.
export function dueReminders(reminders, nowMs) {
  return reminders.filter((r) => !r.sent && r.due_ms - r.tz_offset_min * 60_000 <= nowMs);
}

export async function tick(nowMs = Date.now(), opts = {}) {
  const rows = query('SELECT * FROM reminders WHERE sent = 0');
  for (const r of dueReminders(rows, nowMs)) {
    try {
      await withRetry(() => send(r, opts), { attempts: 5 });
      query('UPDATE reminders SET sent = 1 WHERE id = ?', [r.id]);
    } catch (err) {
      // Stays unsent, so the next tick tries it again.
      console.error(`reminder ${r.id} failed: ${err.message}`);
    }
  }
}

export function startScheduler({ intervalMs = 30_000, ...opts } = {}) {
  return setInterval(() => tick(Date.now(), opts), intervalMs);
}

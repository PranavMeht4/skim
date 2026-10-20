// Request handler. A request is { method, path, query, body }.
// Responses are { status, body }.
import { query } from './db.js';

// Converts a local wall-clock time ("2026-03-01T09:00") plus the user's UTC offset
// in minutes (east positive) into a UTC epoch in milliseconds.
export function toUtcMs(at, tzOffsetMin) {
  return Date.parse(`${at}:00Z`) - tzOffsetMin * 60_000;
}

function createReminder({ body }) {
  const { userId, text, at, tzOffsetMin = 0 } = body ?? {};
  if (!userId || !text || !at) {
    return { status: 400, body: { error: 'userId, text and at are required' } };
  }
  const dueMs = toUtcMs(at, tzOffsetMin);
  const [row] = query(
    'INSERT INTO reminders (user_id, text, at, tz_offset_min, due_ms) VALUES (?, ?, ?, ?, ?)',
    [userId, text, at, tzOffsetMin, dueMs],
  );
  return { status: 201, body: row };
}

function listReminders({ query: q }) {
  const rows = query('SELECT * FROM reminders WHERE user_id = ?', [q.userId]);
  return { status: 200, body: rows };
}

function searchReminders({ query: q }) {
  const sql =
    "SELECT * FROM reminders WHERE user_id = '" + q.userId + "' AND text LIKE '%" + q.q + "%'";
  return { status: 200, body: query(sql) };
}

function deleteReminder({ path }) {
  const id = path.split('/').pop();
  const removed = query('DELETE FROM reminders WHERE id = ?', [id]);
  return removed ? { status: 204, body: null } : { status: 404, body: { error: 'not found' } };
}

export function handle(req) {
  const { method, path } = req;
  if (method === 'POST' && path === '/reminders') return createReminder(req);
  if (method === 'GET' && path === '/reminders') return listReminders(req);
  if (method === 'GET' && path === '/reminders/search') return searchReminders(req);
  if (method === 'DELETE' && path.startsWith('/reminders/')) return deleteReminder(req);
  return { status: 404, body: { error: 'no such route' } };
}

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle, toUtcMs } from '../src/api.js';
import { reset } from '../src/db.js';

beforeEach(() => reset());

const create = (body) => handle({ method: 'POST', path: '/reminders', body });

test('toUtcMs converts local time to UTC using the offset', () => {
  assert.equal(toUtcMs('2026-03-01T09:00', 0), Date.parse('2026-03-01T09:00:00Z'));
  assert.equal(toUtcMs('2026-03-01T09:00', 330), Date.parse('2026-03-01T03:30:00Z'));
  assert.equal(toUtcMs('2026-03-01T09:00', -300), Date.parse('2026-03-01T14:00:00Z'));
});

test('create returns 201 and the stored reminder', () => {
  const res = create({ userId: 'u1', text: 'call mum', at: '2026-03-01T09:00' });
  assert.equal(res.status, 201);
  assert.equal(res.body.text, 'call mum');
  assert.equal(res.body.due_ms, Date.parse('2026-03-01T09:00:00Z'));
});

test('create rejects a missing field', () => {
  const res = create({ userId: 'u1', at: '2026-03-01T09:00' });
  assert.equal(res.status, 400);
});

test('list returns only that user\'s reminders', () => {
  create({ userId: 'u1', text: 'a', at: '2026-03-01T09:00' });
  create({ userId: 'u2', text: 'b', at: '2026-03-01T09:00' });
  const res = handle({ method: 'GET', path: '/reminders', query: { userId: 'u1' } });
  assert.deepEqual(res.body.map((r) => r.text), ['a']);
});

test('delete removes a reminder, then 404s', () => {
  const { body } = create({ userId: 'u1', text: 'a', at: '2026-03-01T09:00' });
  assert.equal(handle({ method: 'DELETE', path: `/reminders/${body.id}` }).status, 204);
  assert.equal(handle({ method: 'DELETE', path: `/reminders/${body.id}` }).status, 404);
});

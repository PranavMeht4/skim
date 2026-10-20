import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders } from '../src/scheduler.js';

const at = (iso) => Date.parse(iso);
const reminder = (over) => ({ id: 1, sent: 0, tz_offset_min: 0, due_ms: at('2026-03-01T09:00:00Z'), ...over });

test('a reminder is due once its time has arrived', () => {
  const r = reminder();
  assert.equal(dueReminders([r], at('2026-03-01T08:59:00Z')).length, 0);
  assert.equal(dueReminders([r], at('2026-03-01T09:00:00Z')).length, 1);
});

test('a reminder that was already sent is not due again', () => {
  const r = reminder({ sent: 1 });
  assert.equal(dueReminders([r], at('2026-03-02T00:00:00Z')).length, 0);
});

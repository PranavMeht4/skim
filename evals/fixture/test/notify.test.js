import { test } from 'node:test';
import assert from 'node:assert/strict';
import { send } from '../src/notify.js';

test('send writes the formatted reminder to the output', async () => {
  const lines = [];
  const r = { user_id: 'u1', text: 'call mum', at: '2026-03-01T09:00' };
  await send(r, { formatter: 'format', out: (l) => lines.push(l) });
  assert.deepEqual(lines, ['Reminder for u1: call mum (set for 2026-03-01T09:00)']);
});

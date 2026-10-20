import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agentsMd } from '../scripts/build-agents-md.mjs';

test('AGENTS.md matches the output style (run: node scripts/build-agents-md.mjs)', () => {
  const actual = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.equal(actual, agentsMd());
});

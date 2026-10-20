import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

test('plugin and package versions match', () => {
  assert.equal(json('.claude-plugin/plugin.json').version, json('package.json').version);
});

test('output style is opt-in and keeps coding instructions', () => {
  const style = readFileSync(new URL('../output-styles/skim.md', import.meta.url), 'utf8');
  // Not forced, so a user's /output-style choice (Concise, another plugin's style) still wins.
  assert.doesNotMatch(style, /^force-for-plugin:/m);
  assert.match(style, /^keep-coding-instructions: true$/m);
});

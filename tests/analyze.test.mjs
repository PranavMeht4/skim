import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../scripts/analyze.mjs';

const skimReply = `**✓ Loop → Lesson refactor done. 41/42 tests pass.**

| Files | Change |
|---|---|
| \`v3/lesson/*\` | new package, 9 files |

⚠ **Risk:** \`spoken_coach.db\` is untracked.
❓ **Needs you:** \`test_reminders_tz\` fails. Fix it now?`;

const wall = 'I looked at the code and ' + 'then I checked another file and '.repeat(12) + 'it works.';

test('skim reply scores as answer-first with no walls', () => {
  const m = analyze(skimReply);
  assert.equal(m.answerFirst, true);
  assert.equal(m.walls, 0);
  assert.equal(m.tables, 1);
  assert.equal(m.maxTableCols, 2);
  assert.equal(m.needsYou, true);
  assert.equal(m.risk, true);
  assert.equal(m.fitsScreen, true);
});

test('marker before bold still counts as answer first', () => {
  assert.equal(analyze('✓ **Done.** All good.').answerFirst, true);
  assert.equal(analyze('## **Verdict: ship it**').answerFirst, true);
});

test('preamble is not answer first', () => {
  assert.equal(analyze("I'll take a look at that.\n\n**Done.**").answerFirst, false);
});

test('long prose paragraph is a wall, code is not', () => {
  assert.equal(analyze(wall).walls, 1);
  assert.equal(analyze('**ok**\n\n```\n' + wall + '\n```').walls, 0);
});

test('wide tables and mermaid are flagged', () => {
  const m = analyze('| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |\n\n```mermaid\ngraph TD\n```');
  assert.equal(m.maxTableCols, 5);
  assert.equal(m.wideTables, true);
  assert.equal(m.mermaid, true);
  assert.equal(m.codeBlocks, 1);
});

test('bolded whole sentences are counted', () => {
  const m = analyze('**This entire sentence is bold which makes it much harder to see what actually matters here.**');
  assert.equal(m.boldSentences, 1);
});

test('long bullets are counted separately from walls', () => {
  const m = analyze('- ' + 'word '.repeat(45));
  assert.equal(m.longBullets, 1);
  assert.equal(m.walls, 0);
});

#!/usr/bin/env node
// Builds evals/viewer/index.html: every eval question with each style's real
// answer side by side, rendered like a terminal, with a blind mode.
// Usage: node evals/viewer/build.mjs   (re-run after a new eval round)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const results = join(here, '..', 'results');
const cases = JSON.parse(readFileSync(join(here, '..', 'cases.json'), 'utf8')).read;

// Which round each column comes from. A column is skipped if its round hasn't run.
const COLUMNS = [
  { key: 'default', label: 'Default', round: '2026-10-20-v0.3', arm: 'default' },
  { key: 'concise', label: 'Concise', round: '2026-10-20-v0.3', arm: 'concise' },
  { key: 'skim', label: 'skim v0.3', round: '2026-10-20-v0.3', arm: 'skim' },
  { key: 'skim031', label: 'skim v0.3.1', round: '2026-10-20-v0.3.1', arm: 'skim' },
  { key: 'skim04', label: 'skim v0.4', round: '2026-10-20-v0.4', arm: 'skim' },
].filter((c) => existsSync(join(results, c.round, 'answers', c.arm)));

const judged = {};
const judgedFor = (round) => {
  const f = join(results, round, 'judged.json');
  return (judged[round] ??= existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).judged : {});
};
const share = (bools) => (bools ? bools.filter(Boolean).length : null);

const data = {
  columns: COLUMNS.map(({ key, label }) => ({ key, label })),
  questions: cases.map((c) => ({
    id: c.id,
    prompt: c.prompt,
    facts: c.mustHave.length,
    answers: Object.fromEntries(COLUMNS.map((col) => {
      const text = readFileSync(join(results, col.round, 'answers', col.arm, `${c.id}.md`), 'utf8');
      const j = judgedFor(col.round)[`${col.arm}/${c.id}`];
      return [col.key, {
        text,
        lines: text.split('\n').length,
        tokens: Math.round(text.length / 3.5),
        factsFull: share(j?.full),
        factsTop: share(j?.first12),
      }];
    })),
  })),
};

const html = readFileSync(join(here, 'template.html'), 'utf8')
  // A replacer function, because answers contain `$` sequences that a replacement string would expand.
  .replace('/*DATA*/null', () => JSON.stringify(data).replace(/</g, '\\u003c'));
writeFileSync(join(here, 'index.html'), html);
console.log(`evals/viewer/index.html: ${data.questions.length} questions x ${COLUMNS.map((c) => c.label).join(', ')}`);

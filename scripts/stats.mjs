#!/usr/bin/env node
// Prints a markdown summary of the replies logged by the Stop hook.
// Usage: node stats.mjs [dataDir] [days]   (defaults: the plugin's data dir, all time)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataDir } from './paths.mjs';

export function summarize(rows) {
  const n = rows.length;
  const pct = (f) => Math.round((100 * rows.filter(f).length) / n) + '%';
  const lines = rows.map((r) => r.lines).sort((a, b) => a - b);
  return [
    `**${n} replies scored.**`,
    '',
    '| Check | Result |',
    '|---|---|',
    `| Answer in line 1 | ${pct((r) => r.answerFirst)} |`,
    `| Fits one screen | ${pct((r) => r.fitsScreen)} |`,
    `| No wall of text | ${pct((r) => r.walls === 0)} |`,
    `| Tables ≤ 4 columns | ${pct((r) => !r.wideTables)} |`,
    `| Median length | ${lines[Math.floor(n / 2)]} lines |`,
  ].join('\n');
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // A data dir argument (not an env prefix) keeps the command matching the skill's Bash(node:*) permission.
  const [dirArg, daysArg] = process.argv.slice(2);
  const dir = dirArg || dataDir();
  const days = Number(daysArg) || 0;
  const since = days ? Date.now() - days * 864e5 : 0;
  let rows = [];
  try {
    rows = readFileSync(join(dir, 'replies.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => r.t >= since);
  } catch {
    // No log yet.
  }
  console.log(rows.length ? summarize(rows) : 'No replies scored yet. Skim logs each reply when a turn ends.');
}

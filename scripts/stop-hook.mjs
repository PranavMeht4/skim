#!/usr/bin/env node
// Stop hook: scores the final reply of each turn and appends the numbers to a
// local log for /skim-stats. Logs metrics only, never the reply text.
// It never blocks the stop and never prints, so it costs zero tokens, and any
// error exits 0 so a broken log can't get in the way of work.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from './analyze.mjs';
import { dataDir } from './paths.mjs';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const { last_assistant_message: reply } = JSON.parse(input);
    if (typeof reply !== 'string' || !reply.trim()) return;
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'replies.jsonl'), JSON.stringify({ t: Date.now(), ...analyze(reply) }) + '\n');
  } catch {
    // Logging is best effort.
  } finally {
    process.exit(0);
  }
});

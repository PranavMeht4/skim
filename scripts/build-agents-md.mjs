#!/usr/bin/env node
// Writes AGENTS.md (for Codex and other agents) from the Claude Code output
// style, so the rules live in one file and the copies can't drift.
// Run after editing output-styles/skim.md; tests fail if you forget.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function agentsMd() {
  const style = readFileSync(root + 'output-styles/skim.md', 'utf8');
  return style.replace(/^---\n[\s\S]*?\n---\n+/, '');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(root + 'AGENTS.md', agentsMd());
  console.log('AGENTS.md updated');
}

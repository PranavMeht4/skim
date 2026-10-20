---
name: stats
description: Show how skimmable recent replies were (answer in line 1, walls of text, screen fit). Run as /skim:stats [days].
argument-hint: "[days]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" "${CLAUDE_PLUGIN_DATA}" $ARGUMENTS`

Show the output above exactly as printed. Add nothing.

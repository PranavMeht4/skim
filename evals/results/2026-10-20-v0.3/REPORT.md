# skim eval report (2026-10-20-v0.3)

Question: does the skim output style make replies faster to skim **without dropping facts or hurting work quality**, compared with Claude Code's default style and its built-in Concise style?

Setup: Claude Code `opus` (one run per cell), 10 read-only prompts x 3 arms, plus 3 fix tasks x 2 arms (all but concise). Facts judged by a blind `sonnet` judge (3 independent passes per answer; a fact scores the share of passes that found it). n=1 per cell: read the numbers as a pilot, not a verdict (see `evals/README.md`).

## Headline (10 read-only prompts per arm)

| Metric | default | concise | skim |
|---|---|---|---|
| mustHave facts kept, full answer | 97.2% | 85.2% | 86.1% |
| &nbsp;&nbsp;(count) | 35.0/36 | 30.7/36 | 31.0/36 |
| mustHave facts in first 12 source lines | 41.7% | 75% | 75% |
| &nbsp;&nbsp;(count) | 15.0/36 | 27.0/36 | 27.0/36 |
| mustHave facts in first 24 rendered rows (100 cols, 1 judge pass) | 49.1% | 71.3% | 78.7% |
| words in the first 12 source lines (median) | 165.5 | 230.5 | 174 |
| answer-first, line 1 is bold (analyze.mjs) | 0% | 10% | 100% |
| answer-first, judge says line 1 answers | 76.7% | 100% | 100% |
| median source lines | 35.5 | 21 | 28 |
| median rendered rows at 100 cols (long lines wrap) | 58.5 | 37 | 49.5 |
| median words (outside code blocks) | 640 | 397 | 497.5 |
| wall-of-text paragraphs (total) | 9 | 4 | 6 |
| fit one screen, <=40 source lines | 60% | 90% | 70% |
| fit one screen, <=40 rendered rows | 30% | 60% | 40% |
| median output tokens (whole run) | 8970.5 | 5015.5 | 10256.5 |
| avg output tokens per question (whole run) | 6989 | 4528 | 8480 |
| &nbsp;&nbsp;of which thinking | 3484 | 2191 | 5122 |
| &nbsp;&nbsp;of which the reply you read (~chars/3.5) | 1047 | 679 | 802 |
| median wall time (s) | 111 | 88 | 161 |
| median turns | 15.5 | 9.5 | 18 |
| cost, read-only runs | $6.03 | $5.05 | $6.49 |
| fix tasks passed (hidden check) | 3/3 | n/a | 3/3 |

"Answer-first, line 1 is bold" is the exact test skim's own rule is written to satisfy, so it is partly circular. The judge column asks a neutral question: does line 1 alone give the answer?

## Skim vs the others, case by case (win / tie / loss for skim)

| Comparison | facts, full | facts, first 12 lines | facts, first 24 rows | fewer lines | fewer rows |
|---|---|---|---|---|---|
| skim vs default | 0 / 6 / 4 | 7 / 1 / 2 | 7 / 3 / 0 | 8 / 0 / 2 | 9 / 0 / 1 |
| skim vs concise | 0 / 10 / 0 | 2 / 6 / 2 | 3 / 6 / 1 | 2 / 0 / 8 | 2 / 0 / 8 |

## Per case (facts full / facts in first 12 lines / lines / output tokens)

| Case | facts | default | concise | skim |
|---|---|---|---|---|
| lookup-retries | 3 | 3.0 / 3.0 / 11L / 1220t | 2.0 / 2.0 / 3L / 908t | 2.0 / 2.0 / 8L / 1714t |
| flow-create-to-delivery | 4 | 4.0 / 0.0 / 57L / 9154t | 4.0 / 4.0 / 31L / 6655t | 4.0 / 4.0 / 30L / 9435t |
| bug-timezone | 4 | 4.0 / 1.0 / 28L / 3458t | 3.0 / 3.0 / 10L / 1749t | 3.0 / 3.0 / 15L / 1737t |
| compare-storage | 3 | 3.0 / 1.0 / 33L / 8952t | 1.7 / 2.0 / 22L / 4388t | 2.0 / 2.0 / 32L / 11078t |
| review-api | 3 | 3.0 / 1.0 / 29L / 8989t | 3.0 / 3.0 / 13L / 5643t | 3.0 / 2.0 / 26L / 13692t |
| plan-quiet-hours | 4 | 3.0 / 2.0 / 59L / 11627t | 3.0 / 2.0 / 46L / 6526t | 3.0 / 3.0 / 50L / 12997t |
| safe-delete-legacy | 3 | 3.0 / 3.0 / 18L / 2069t | 3.0 / 3.0 / 12L / 1552t | 3.0 / 2.0 / 24L / 3668t |
| jitter-correct | 4 | 4.0 / 1.0 / 38L / 3227t | 4.0 / 4.0 / 20L / 2252t | 4.0 / 4.0 / 19L / 2601t |
| overview | 4 | 4.0 / 0.0 / 100L / 9288t | 3.0 / 2.0 / 24L / 6550t | 3.0 / 2.0 / 62L / 13939t |
| test-gaps | 4 | 4.0 / 3.0 / 43L / 11906t | 4.0 / 2.0 / 29L / 9058t | 4.0 / 3.0 / 47L / 13935t |

## Fix tasks (hidden check: behaviour + existing tests green + a test added)

| Task | default | skim |
|---|---|---|
| fix-timezone | PASS (13 tests, 25 turns, $0.77) | PASS (13 tests, 26 turns, $1.02) |
| fix-sql | PASS (13 tests, 14 turns, $0.79) | PASS (13 tests, 15 turns, $0.71) |
| fix-jitter | PASS (12 tests, 7 turns, $0.28) | PASS (12 tests, 7 turns, $0.30) |

Fix-task final messages, median source lines: default 14, skim 11; median rendered rows: default 23, skim 17.

## Cost

| Item | USD |
|---|---|
| Runs, all arms (sum of total_cost_usd) | $21.46 |
| Judge (sonnet, 3 passes, plus 1 pass for the 24-row window) | $1.67 |
| **Total** | **$23.12** |

About $0.22 more went on development probes before the run (one skim smoke test and two judge-cost tests); it is not in the total above.

Judge consistency: per-fact agreement between passes averaged 99.4%. Judge calls that failed to return usable JSON: 0.

## Files

- `raw/<arm>/<case>.json`: full `claude -p` JSON (answer, usage, cost, timings, permission denials, hidden-check result)
- `answers/<arm>/<case>.md`: the answer text exactly as returned
- `patches/<arm>/<case>.patch`: what each fix run changed
- `judged.json`: per-fact judge verdicts, every pass
- `summary.json`: all numbers above, plus per-cell detail

# skim eval report (2026-10-20-lite)

Question: does the skim output style make replies faster to skim **without dropping facts or hurting work quality**, compared with Claude Code's default style and its built-in Concise style?

Setup: Claude Code `opus` (one run per cell), 10 read-only prompts x 3 arms, plus 3 fix tasks x 2 arms (all but concise). Facts judged by a blind `sonnet` judge (3 independent passes per answer; a fact scores the share of passes that found it). n=1 per cell: read the numbers as a pilot, not a verdict (see `evals/README.md`).

## Headline (10 read-only prompts per arm)

| Metric | default | concise | skim |
|---|---|---|---|
| mustHave facts kept, full answer | 97.2% | 84.3% | 88% |
| &nbsp;&nbsp;(count) | 35.0/36 | 30.3/36 | 31.7/36 |
| mustHave facts in first 12 source lines | 40.7% | 74.1% | 47.2% |
| &nbsp;&nbsp;(count) | 14.7/36 | 26.7/36 | 17.0/36 |
| mustHave facts in first 24 rendered rows (100 cols, 1 judge pass) | 48.1% | 71.3% | 55.6% |
| words in the first 12 source lines (median) | 165.5 | 230.5 | 197.5 |
| answer-first, line 1 is bold (analyze.mjs) | 0% | 10% | 100% |
| answer-first, judge says line 1 answers | 70% | 100% | 96.7% |
| median source lines | 35.5 | 21 | 28 |
| median rendered rows at 100 cols (long lines wrap) | 58.5 | 37 | 43.5 |
| median words (outside code blocks) | 640 | 397 | 399.5 |
| wall-of-text paragraphs (total) | 9 | 4 | 1 |
| fit one screen, <=40 source lines | 60% | 90% | 70% |
| fit one screen, <=40 rendered rows | 30% | 60% | 50% |
| median output tokens (whole run) | 8970.5 | 5015.5 | 7060 |
| avg output tokens per question (whole run) | 6989 | 4528 | 6612 |
| &nbsp;&nbsp;of which thinking | 3484 | 2191 | 3402 |
| &nbsp;&nbsp;of which the reply you read (~chars/3.5) | 1047 | 679 | 825 |
| median wall time (s) | 111 | 88 | 133 |
| median turns | 15.5 | 9.5 | 16 |
| cost, read-only runs | $6.03 | $5.05 | $6.11 |
| fix tasks passed (hidden check) | 3/3 | n/a | 3/3 |

"Answer-first, line 1 is bold" is the exact test skim's own rule is written to satisfy, so it is partly circular. The judge column asks a neutral question: does line 1 alone give the answer?

## Skim vs the others, case by case (win / tie / loss for skim)

| Comparison | facts, full | facts, first 12 lines | facts, first 24 rows | fewer lines | fewer rows |
|---|---|---|---|---|---|
| skim vs default | 0 / 8 / 2 | 4 / 4 / 2 | 4 / 5 / 1 | 7 / 0 / 3 | 8 / 1 / 1 |
| skim vs concise | 2 / 7 / 1 | 1 / 3 / 6 | 1 / 3 / 6 | 0 / 0 / 10 | 1 / 0 / 9 |

## Per case (facts full / facts in first 12 lines / lines / output tokens)

| Case | facts | default | concise | skim |
|---|---|---|---|---|
| lookup-retries | 3 | 3.0 / 2.3 / 11L / 1220t | 3.0 / 2.3 / 3L / 908t | 3.0 / 3.0 / 8L / 1520t |
| flow-create-to-delivery | 4 | 4.0 / 0.0 / 57L / 9154t | 4.0 / 4.0 / 31L / 6655t | 4.0 / 0.0 / 55L / 6874t |
| bug-timezone | 4 | 4.0 / 1.0 / 28L / 3458t | 3.0 / 3.0 / 10L / 1749t | 2.0 / 1.0 / 18L / 2933t |
| compare-storage | 3 | 3.0 / 2.0 / 33L / 8952t | 0.3 / 1.3 / 22L / 4388t | 1.7 / 1.0 / 34L / 10416t |
| review-api | 3 | 3.0 / 0.7 / 29L / 8989t | 3.0 / 3.0 / 13L / 5643t | 3.0 / 2.0 / 22L / 8258t |
| plan-quiet-hours | 4 | 3.0 / 1.3 / 59L / 11627t | 3.0 / 2.0 / 46L / 6526t | 3.0 / 1.0 / 64L / 11935t |
| safe-delete-legacy | 3 | 3.0 / 3.0 / 18L / 2069t | 3.0 / 3.0 / 12L / 1552t | 3.0 / 3.0 / 19L / 3727t |
| jitter-correct | 4 | 4.0 / 1.0 / 38L / 3227t | 4.0 / 4.0 / 20L / 2252t | 4.0 / 4.0 / 21L / 2165t |
| overview | 4 | 4.0 / 0.0 / 100L / 9288t | 3.0 / 2.0 / 24L / 6550t | 4.0 / 1.0 / 57L / 7246t |
| test-gaps | 4 | 4.0 / 3.3 / 43L / 11906t | 4.0 / 2.0 / 29L / 9058t | 4.0 / 1.0 / 34L / 11042t |

## Fix tasks (hidden check: behaviour + existing tests green + a test added)

| Task | default | skim |
|---|---|---|
| fix-timezone | PASS (13 tests, 25 turns, $0.77) | PASS (12 tests, 17 turns, $0.69) |
| fix-sql | PASS (13 tests, 14 turns, $0.79) | PASS (13 tests, 10 turns, $0.67) |
| fix-jitter | PASS (12 tests, 7 turns, $0.28) | PASS (12 tests, 12 turns, $0.57) |

Fix-task final messages, median source lines: default 14, skim 15; median rendered rows: default 23, skim 26.

## Cost

| Item | USD |
|---|---|
| Runs, all arms (sum of total_cost_usd) | $20.97 |
| Judge (sonnet, 3 passes, plus 1 pass for the 24-row window) | $1.63 |
| **Total** | **$22.60** |

About $0.22 more went on development probes before the run (one skim smoke test and two judge-cost tests); it is not in the total above.

Judge consistency: per-fact agreement between passes averaged 95.3%. Judge calls that failed to return usable JSON: 0.

## Files

- `raw/<arm>/<case>.json`: full `claude -p` JSON (answer, usage, cost, timings, permission denials, hidden-check result)
- `answers/<arm>/<case>.md`: the answer text exactly as returned
- `patches/<arm>/<case>.patch`: what each fix run changed
- `judged.json`: per-fact judge verdicts, every pass
- `summary.json`: all numbers above, plus per-cell detail

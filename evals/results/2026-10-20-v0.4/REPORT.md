# skim eval report (2026-10-20-v0.4)

Question: does the skim output style make replies faster to skim **without dropping facts or hurting work quality**, compared with Claude Code's default style and its built-in Concise style?

Setup: Claude Code `opus` (one run per cell), 10 read-only prompts x 3 arms, plus 3 fix tasks x 2 arms (all but concise). Facts judged by a blind `sonnet` judge (3 independent passes per answer; a fact scores the share of passes that found it). n=1 per cell: read the numbers as a pilot, not a verdict (see `evals/README.md`).

## Headline (10 read-only prompts per arm)

| Metric | default | concise | skim |
|---|---|---|---|
| mustHave facts kept, full answer | 96.3% | 84.3% | 86.1% |
| &nbsp;&nbsp;(count) | 34.7/36 | 30.3/36 | 31.0/36 |
| mustHave facts in first 12 source lines | 37% | 72.2% | 53.7% |
| &nbsp;&nbsp;(count) | 13.3/36 | 26.0/36 | 19.3/36 |
| mustHave facts in first 24 rendered rows (100 cols, 1 judge pass) | 51.9% | 67.6% | 59.3% |
| words in the first 12 source lines (median) | 165.5 | 230.5 | 121.5 |
| answer-first, line 1 is bold (analyze.mjs) | 0% | 10% | 100% |
| answer-first, judge says line 1 answers | 70% | 100% | 100% |
| median source lines | 35.5 | 21 | 45.5 |
| median rendered rows at 100 cols (long lines wrap) | 58.5 | 37 | 60.5 |
| median words (outside code blocks) | 640 | 397 | 505 |
| wall-of-text paragraphs (total) | 9 | 4 | 4 |
| fit one screen, <=40 source lines | 60% | 90% | 50% |
| fit one screen, <=40 rendered rows | 30% | 60% | 20% |
| median output tokens (whole run) | 8970.5 | 5015.5 | 8528.5 |
| avg output tokens per question (whole run) | 6989 | 4528 | 8246 |
| &nbsp;&nbsp;of which thinking | 3484 | 2191 | 5041 |
| &nbsp;&nbsp;of which the reply you read (~chars/3.5) | 1047 | 679 | 974 |
| median wall time (s) | 111 | 88 | 160 |
| median turns | 15.5 | 9.5 | 15 |
| cost, read-only runs | $6.03 | $5.05 | $6.41 |
| fix tasks passed (hidden check) | 3/3 | n/a | 3/3 |

"Answer-first, line 1 is bold" is the exact test skim's own rule is written to satisfy, so it is partly circular. The judge column asks a neutral question: does line 1 alone give the answer?

## Skim vs the others, case by case (win / tie / loss for skim)

| Comparison | facts, full | facts, first 12 lines | facts, first 24 rows | fewer lines | fewer rows |
|---|---|---|---|---|---|
| skim vs default | 0 / 8 / 2 | 7 / 2 / 1 | 5 / 4 / 1 | 3 / 0 / 7 | 4 / 0 / 6 |
| skim vs concise | 2 / 7 / 1 | 2 / 2 / 6 | 2 / 4 / 4 | 0 / 0 / 10 | 0 / 0 / 10 |

## Per case (facts full / facts in first 12 lines / lines / output tokens)

| Case | facts | default | concise | skim |
|---|---|---|---|---|
| lookup-retries | 3 | 3.0 / 2.0 / 11L / 1220t | 2.3 / 2.0 / 3L / 908t | 2.3 / 3.0 / 17L / 1834t |
| flow-create-to-delivery | 4 | 4.0 / 0.3 / 57L / 9154t | 4.0 / 4.0 / 31L / 6655t | 3.7 / 1.3 / 52L / 13105t |
| bug-timezone | 4 | 4.0 / 1.0 / 28L / 3458t | 3.0 / 3.0 / 10L / 1749t | 4.0 / 1.0 / 36L / 3140t |
| compare-storage | 3 | 3.0 / 2.0 / 33L / 8952t | 1.0 / 1.0 / 22L / 4388t | 0.0 / 0.0 / 71L / 9734t |
| review-api | 3 | 3.0 / 1.0 / 29L / 8989t | 3.0 / 3.0 / 13L / 5643t | 3.0 / 2.0 / 39L / 10853t |
| plan-quiet-hours | 4 | 3.0 / 1.0 / 59L / 11627t | 3.0 / 2.0 / 46L / 6526t | 3.0 / 2.0 / 96L / 13827t |
| safe-delete-legacy | 3 | 3.0 / 3.0 / 18L / 2069t | 3.0 / 3.0 / 12L / 1552t | 3.0 / 3.0 / 27L / 2418t |
| jitter-correct | 4 | 4.0 / 1.0 / 38L / 3227t | 4.0 / 4.0 / 20L / 2252t | 4.0 / 3.0 / 36L / 4997t |
| overview | 4 | 3.7 / 0.0 / 100L / 9288t | 3.0 / 2.0 / 24L / 6550t | 4.0 / 1.0 / 76L / 7323t |
| test-gaps | 4 | 4.0 / 2.0 / 43L / 11906t | 4.0 / 2.0 / 29L / 9058t | 4.0 / 3.0 / 79L / 15229t |

## Fix tasks (hidden check: behaviour + existing tests green + a test added)

| Task | default | skim |
|---|---|---|
| fix-timezone | PASS (13 tests, 25 turns, $0.77) | PASS (12 tests, 18 turns, $0.45) |
| fix-sql | PASS (13 tests, 14 turns, $0.79) | PASS (13 tests, 10 turns, $0.71) |
| fix-jitter | PASS (12 tests, 7 turns, $0.28) | PASS (13 tests, 7 turns, $0.53) |

Fix-task final messages, median source lines: default 14, skim 30; median rendered rows: default 23, skim 38.

## Cost

| Item | USD |
|---|---|
| Runs, all arms (sum of total_cost_usd) | $21.03 |
| Judge (sonnet, 3 passes, plus 1 pass for the 24-row window) | $1.63 |
| **Total** | **$22.66** |

About $0.22 more went on development probes before the run (one skim smoke test and two judge-cost tests); it is not in the total above.

Judge consistency: per-fact agreement between passes averaged 96.1%. Judge calls that failed to return usable JSON: 0.

## Files

- `raw/<arm>/<case>.json`: full `claude -p` JSON (answer, usage, cost, timings, permission denials, hidden-check result)
- `answers/<arm>/<case>.md`: the answer text exactly as returned
- `patches/<arm>/<case>.patch`: what each fix run changed
- `judged.json`: per-fact judge verdicts, every pass
- `summary.json`: all numbers above, plus per-cell detail

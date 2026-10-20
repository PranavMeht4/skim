# skim eval report (2026-10-20)

Question: does the skim output style make replies faster to skim **without dropping facts or hurting work quality**, compared with Claude Code's default style and its built-in Concise style?

Setup: Claude Code `opus` (one run per cell), 10 read-only prompts x 3 arms, plus 3 fix tasks x 2 arms (all but concise). Facts judged by a blind `sonnet` judge (3 independent passes per answer; a fact scores the share of passes that found it). n=1 per cell: read the numbers as a pilot, not a verdict (see `evals/README.md`).

## Headline (10 read-only prompts per arm)

| Metric | default | concise | skim |
|---|---|---|---|
| mustHave facts kept, full answer | 94.4% | 82.4% | 89.8% |
| &nbsp;&nbsp;(count) | 34.0/36 | 29.7/36 | 32.3/36 |
| mustHave facts in first 12 source lines | 41.7% | 72.2% | 42.6% |
| &nbsp;&nbsp;(count) | 15.0/36 | 26.0/36 | 15.3/36 |
| mustHave facts in first 24 rendered rows (100 cols, 1 judge pass) | 52.8% | 72.2% | 55.6% |
| words in the first 12 source lines (median) | 165.5 | 230.5 | 109.5 |
| answer-first, line 1 is bold (analyze.mjs) | 0% | 10% | 100% |
| answer-first, judge says line 1 answers | 73.3% | 100% | 100% |
| median source lines | 35.5 | 21 | 36 |
| median rendered rows at 100 cols (long lines wrap) | 58.5 | 37 | 50.5 |
| median words (outside code blocks) | 640 | 397 | 427 |
| wall-of-text paragraphs (total) | 9 | 4 | 2 |
| fit one screen, <=40 source lines | 60% | 90% | 60% |
| fit one screen, <=40 rendered rows | 30% | 60% | 30% |
| median output tokens (whole run) | 8970.5 | 5015.5 | 7585.5 |
| avg output tokens per question (whole run) | 6989 | 4528 | 7582 |
| &nbsp;&nbsp;of which thinking | 3484 | 2191 | 4165 |
| &nbsp;&nbsp;of which the reply you read (~chars/3.5) | 1047 | 679 | 830 |
| median wall time (s) | 111 | 88 | 139 |
| median turns | 15.5 | 9.5 | 18 |
| cost, read-only runs | $6.03 | $5.05 | $6.20 |
| fix tasks passed (hidden check) | 3/3 | n/a | 3/3 |

"Answer-first, line 1 is bold" is the exact test skim's own rule is written to satisfy, so it is partly circular. The judge column asks a neutral question: does line 1 alone give the answer?

## Skim vs the others, case by case (win / tie / loss for skim)

| Comparison | facts, full | facts, first 12 lines | facts, first 24 rows | fewer lines | fewer rows |
|---|---|---|---|---|---|
| skim vs default | 2 / 5 / 3 | 3 / 4 / 3 | 3 / 4 / 3 | 3 / 1 / 6 | 7 / 0 / 3 |
| skim vs concise | 4 / 4 / 2 | 2 / 1 / 7 | 1 / 3 / 6 | 0 / 0 / 10 | 0 / 0 / 10 |

## Per case (facts full / facts in first 12 lines / lines / output tokens)

| Case | facts | default | concise | skim |
|---|---|---|---|---|
| lookup-retries | 3 | 2.0 / 3.0 / 11L / 1220t | 2.0 / 2.0 / 3L / 908t | 3.0 / 2.0 / 16L / 1324t |
| flow-create-to-delivery | 4 | 4.0 / 0.0 / 57L / 9154t | 4.0 / 4.0 / 31L / 6655t | 4.0 / 1.0 / 57L / 8028t |
| bug-timezone | 4 | 4.0 / 1.0 / 28L / 3458t | 3.0 / 3.0 / 10L / 1749t | 2.0 / 1.0 / 24L / 2387t |
| compare-storage | 3 | 3.0 / 1.7 / 33L / 8952t | 0.7 / 1.0 / 22L / 4388t | 2.0 / 2.0 / 37L / 7143t |
| review-api | 3 | 3.0 / 0.3 / 29L / 8989t | 3.0 / 3.0 / 13L / 5643t | 2.3 / 0.0 / 35L / 12178t |
| plan-quiet-hours | 4 | 3.0 / 1.0 / 59L / 11627t | 3.0 / 2.0 / 46L / 6526t | 4.0 / 1.0 / 69L / 14303t |
| safe-delete-legacy | 3 | 3.0 / 3.0 / 18L / 2069t | 3.0 / 3.0 / 12L / 1552t | 3.0 / 2.0 / 27L / 2386t |
| jitter-correct | 4 | 4.0 / 1.0 / 38L / 3227t | 4.0 / 4.0 / 20L / 2252t | 4.0 / 2.3 / 34L / 3579t |
| overview | 4 | 4.0 / 0.0 / 100L / 9288t | 3.0 / 2.0 / 24L / 6550t | 4.0 / 1.0 / 59L / 9432t |
| test-gaps | 4 | 4.0 / 4.0 / 43L / 11906t | 4.0 / 2.0 / 29L / 9058t | 4.0 / 3.0 / 69L / 15064t |

## Fix tasks (hidden check: behaviour + existing tests green + a test added)

| Task | default | skim |
|---|---|---|
| fix-timezone | PASS (13 tests, 25 turns, $0.77) | PASS (12 tests, 21 turns, $0.75) |
| fix-sql | PASS (13 tests, 14 turns, $0.79) | PASS (14 tests, 12 turns, $0.72) |
| fix-jitter | PASS (12 tests, 7 turns, $0.28) | PASS (14 tests, 11 turns, $0.36) |

Fix-task final messages, median source lines: default 14, skim 28; median rendered rows: default 23, skim 37.

## Cost

| Item | USD |
|---|---|
| Runs, all arms (sum of total_cost_usd) | $20.97 |
| Judge (sonnet, 3 passes, plus 1 pass for the 24-row window) | $2.22 |
| **Total** | **$23.19** |

About $0.22 more went on development probes before the run (one skim smoke test and two judge-cost tests); it is not in the total above.

Judge consistency: per-fact agreement between passes averaged 96.3%. Judge calls that failed to return usable JSON: 0.

## Reading the numbers

- **No leak between arms.** Default never opens with a bold line (0 of 10); skim always does (10 of 10); concise differs from both (3 lines for the lookup, 21 median lines). The three arms produce visibly different text, so the styles were applied.
- **Facts kept:** skim 32.3 of 36, default 34.0, concise 29.7. Per case, skim wins 2, ties 5, loses 3 against default (a 0.5-fact margin counts). With n=1 this is a tie, not a loss. The one clear drop is `answers/skim/bug-timezone.md` (2.0 of 4 against 4.0). It never says west-of-UTC users get reminders late, and it names `scheduler.js:9` but not `dueReminders`.
- **Skimmability is mixed.** Against default, skim has 33% fewer prose words (427 against 640 median), 14% fewer rendered rows at 100 columns (50.5 against 58.5, fewer in 7 of 10 cases), 2 wall-of-text paragraphs against 9, fewer words in its first 12 lines (110 against 166), and the judge finds the answer on line 1 in 10 of 10 (default about 7 of 10). But source lines are the same (36 against 35.5), and the facts in the first screenful are about the same: 42.6% against 41.7% in 12 lines, 55.6% against 52.8% in 24 rendered rows. Against Concise, Concise is shorter on every length measure (21 lines, 37 rows, 397 words) and holds 72.2% of the facts in both its first 12 lines and first 24 rows; the two tie on "line 1 answers" (100%). Source-line counts flatter Concise, which writes whole paragraphs as single long lines, so the rendered-row columns are the fairer length measure; Concise still leads on them. Concise also keeps fewer facts overall (82.4% against 89.8% for skim and 94.4% for default); part of that is `compare-storage`, where it picked a JSON file because the README says Node 20, and the fact list scores that as a miss because the author's ground truth said SQLite.
- **Work quality was not hurt on these 3 tasks:** 3 of 3 fix tasks pass for both default and skim. All of them are easy, so this is a floor check only.
- **Cost is not a benefit:** skim read-only runs cost $6.20 against $6.03 for default and $5.05 for Concise. Median output tokens are 15% lower than default (7,586 against 8,971) but 51% higher than Concise.
- **Judge:** 96.3% per-fact agreement between the 3 passes. Spot checks found literal-minded misses on location facts, in both directions of style: `default/lookup-retries` was denied "set in `tick()`" because it cites `scheduler.js:16` and the code instead of the function name, and `skim/bug-timezone` was denied "in `dueReminders`" for the same reason. Fact wording was not changed after seeing results.

## Three biggest weaknesses of skim in the raw answers

1. **It saves words but little screen, and it does not front-load facts better than default.** Source lines equal default's, rendered rows are only 14% lower, and "fits one screen" (40 rows or fewer) is 30% for both default and skim (Concise 60%). `answers/skim/lookup-retries.md` is 16 lines (19 rows) for a question its own table says should take 1 to 3 lines (default 11 lines, 18 rows; Concise 3 lines, 8 rows). `answers/skim/test-gaps.md` is 69 lines (85 rows) against 43 (74) for default. The fix-task final messages (`answers/skim/fix-*.md`) have a median of 28 lines against 14 for default, about 37 rows against 23. The extra is diagrams, tables, and a summary table that repeats the sections below it.
2. **The "line 1 is the answer, in bold" rule collides with "never bold a whole sentence" and pulls in off-topic findings.** 8 of 10 skim line 1s are bold spans over 12 words (analyze.mjs counts 11 bold sentences for skim, 2 for default, 0 for Concise). Line 1 also drifts to whatever the model found most severe: `answers/skim/review-api.md` leads with the timezone bug, which is not in `api.js`, and `answers/skim/flow-create-to-delivery.md` spends the second half of its bold line 1 on a bug the user did not ask about.
3. **The `❓ Needs you` and `⚠ Risk` trailers become a ritual, in effect a closing offer.** They appear in 8 of 10 and 7 of 10 read-only answers (default 0, Concise 0), including questions that need no decision: `answers/skim/test-gaps.md` ends "should I fix `scheduler.js:9` and add tests for #1-3?", `answers/skim/bug-timezone.md` asks permission to run `npm test`, and `answers/skim/lookup-retries.md` adds a Risk line. The style's own "Before you send" step says to delete closing offers. These trailers are also where unrelated findings pile up (`answers/skim/flow-create-to-delivery.md` closes with an SQL-injection risk that is off the create-to-deliver path), and the same off-topic findings also show up in the default and Concise answers, so that part is the model, not the style.

## Files

- `raw/<arm>/<case>.json`: full `claude -p` JSON (answer, usage, cost, timings, permission denials, hidden-check result)
- `answers/<arm>/<case>.md`: the answer text exactly as returned
- `patches/<arm>/<case>.patch`: what each fix run changed
- `judged.json`: per-fact judge verdicts, every pass
- `summary.json`: all numbers above, plus per-cell detail

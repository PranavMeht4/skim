# skim evals

Does the `skim` output style make replies faster to skim **without dropping facts or hurting work quality**, compared with Claude Code's default style and its built-in Concise style?

Results of the first run are in `results/2026-10-20/` (start with `REPORT.md`).

## What is here

| Path | What |
|---|---|
| `fixture/` | A small Node 20 project (a "reminder service", 8 source files, 11 `node:test` tests, no dependencies) with planted issues |
| `hidden/check.mjs` | Pass/fail checks for the 3 fix tasks. Never copied into a run directory |
| `cases.json` | 10 read-only prompts with 3 to 4 ground-truth facts each (`mustHave`), plus 3 fix tasks |
| `run.mjs` | Runs every cell in a fresh temp copy of the fixture, saves raw JSON, answers and patches |
| `judge.mjs` | Blind LLM judge: which `mustHave` facts are in the full answer, and in the first 12 lines only |
| `rows.mjs` | Rendered terminal rows (100 columns), used by `judge.mjs` and `report.mjs` |
| `report.mjs` | Scores answers with `scripts/analyze.mjs`, joins the judge output, writes `summary.json` and `REPORT.md` |
| `results/<date>/` | `raw/` (full `claude -p` JSON), `answers/` (answer text), `patches/` (what fix runs changed), `judged.json`, `summary.json`, `REPORT.md` |

Re-run: `node evals/run.mjs && node evals/judge.mjs && node evals/report.mjs` (Node 20, `claude` on the PATH, about $20 to $25 at the first run's prices). `run.mjs` skips cells that already have a raw file, so a stopped run resumes; `--force` redoes them.

## The fixture's planted issues

| Id | Issue | Where |
|---|---|---|
| a | Timezone offset is applied twice, so reminders fire early for users east of UTC (late for west). Tests only use offset 0 | `src/api.js` `toUtcMs` is right, `src/scheduler.js` `dueReminders` subtracts it again |
| b | Search SQL is built by string concatenation | `src/api.js` `searchReminders` |
| c | Jitter (fixed +/-500 ms) is added after the cap and is bigger than the early delays, so the delay can go below 0 or above `maxDelayMs` | `src/retry.js` `backoffDelay` |
| d | `src/legacy.js` looks unused but `config.json` selects it and `src/notify.js` loads it with a template-string `import()`. No test covers it | `notify.js`, `config.json` |
| e | `tick()` (send, mark sent, failure path) has no tests | `src/scheduler.js` |

Ground-truth facts in `cases.json` were written from the fixture source before any run, not from model answers. Models also found real extra issues (for example overlapping ticks can double-send, and the toy SQL parser breaks on a search containing "and"); those are not scored.

## Method

- **Cells:** 10 read-only prompts per arm, plus 3 fix tasks per arm (all arms but concise), **1 run per cell**, 4 at a time, 5-minute timeout each.
- **Rounds:** `results/2026-10-20` = skim v0.1; `-v0.2` = skim v0.2; `-v0.3` = skim v0.3. Later rounds reuse the earlier default and concise answers and re-judge every arm, so the same answer can score 1–3 points differently between rounds (judge noise).
- **Every run:** a fresh temp copy of `fixture/` outside any git repo, `claude -p "<prompt>" --model opus --output-format json`.
  - Read-only: `--allowedTools "Read,Grep,Glob"`.
  - Fix: `--allowedTools "Read,Grep,Glob,Edit,Write,Bash(node:*)" --permission-mode acceptEdits`, then the hidden check runs on the result.
- **Arms:**

  | Arm | Extra flags |
  |---|---|
  | default | none |
  | concise | `--settings '{"outputStyle":"Concise"}'` |
  | skim | `--plugin-dir <this repo>` (the plugin forces its own style) |

  Two flags were added to **all** arms because they do not change how the model answers: `--no-session-persistence` (no throwaway sessions in `~/.claude`) and `disableAllHooks` in `--settings` (otherwise skim's Stop hook would append eval rows to the user's real `/skim-stats` log). Whether each arm's style was really applied was checked from the outputs: default never opens with a bold line, skim always does, concise differs from both. If skim is installed for real, every arm also gets `enabledPlugins: {"skim@skim": false}` so the installed copy can't leak into the baselines.
- **Hidden check (fix tasks):** the behaviour is right (end to end, through `handle()` and `tick()` for the timezone fix; no user input in the SQL text, raw or quote-escaped, for the SQL fix; delay in `[0, maxDelayMs]` over many attempts and random values, jitter still present, for the retry fix), the visible suite is green, and at least one test was added (baseline 11). `hidden/check.mjs` was verified to fail on the pristine fixture and pass on a hand-fixed copy.
- **Judge:** `sonnet`, no tools, blind to the arm, sees only the question, the facts and the answer text. Two prompts per answer: (a) the full answer, plus "does line 1 alone give the answer?"; (b) the first 12 lines only (raw lines, blank lines included). 3 independent passes per prompt; a fact's score is the share of passes that found it. A later, single extra pass judged the first 24 rendered rows (`node judge.mjs --window-rows 24 --passes 1`), added after review because source-line windows favour long-paragraph styles.
- **Metrics:** `scripts/analyze.mjs` is imported as is for lines, words, walls of text, bold line 1 and so on. Output tokens come from `usage.output_tokens` of the whole run (thinking and tool calls included). Wall time is measured around the process.

## What this does NOT prove

- **n = 1 per cell, 10 prompts.** One fact is about 2.8 points of the percentages here (36 facts per arm). Differences of a few points are noise; there are no confidence intervals. Run-to-run variance of the same arm was not measured.
- **One model** (`opus`, which resolved to Claude Opus 5.5 with the effort level from the user settings) and one small synthetic repo with prompts the author wrote. Other models, languages, task types, long sessions and real repos could behave differently.
- **Skimmability is proxied, not measured.** There is no human reading test. "Facts in the first 12 lines" and "line 1 answers" are stand-ins for how fast a person finds the answer; number of lines is a stand-in for scrolling.
- **Line counts depend on how text is laid out.** Source lines undercount answers that write a paragraph on one long line (Concise does) and overcount lists and tables. The report therefore also gives rendered rows, assuming a 100-column terminal (`rows.mjs`), and a judge pass on the first 24 rendered rows. The 100-column width is an assumption; real terminals and viewers differ.
- **"Answer-first, bold line 1" is circular.** It is the very pattern skim's rules ask for, so skim scores near 100% by construction. The judge-based column is the fairer one.
- **LLM judge.** A sonnet judge decides whether a fact is present; it can be wrong or lenient, and it can differ between passes (agreement is reported). The facts were chosen by the author, so they favour what the author thinks a good answer contains. Extra true findings in an answer are not rewarded.
- **Work quality is only tested on 3 easy fixes**, all of which every arm is expected to pass. That shows skim did not break the work on these tasks; it cannot show skim is as good on harder ones.
- **Same environment for every arm**, including the same user-level `CLAUDE.md`, and the models often tried `Bash` in read-only runs and were denied (counts in `summary.json`). That affects all arms alike but is not "clean room".
- **Costs and times** depend on prompt caching and server load at the time and are not a stable property of a style.
- The 6 cells for `lookup-retries` and `safe-delete-legacy` came from a pilot with identical settings and were kept rather than re-run, to save money.

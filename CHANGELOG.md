# Changelog

Numbers are from [`evals/`](evals): Claude Opus, 10 questions, one run each, blind judge. "First 12" = key facts in the first 12 lines.

## 0.6.0 · 2026-10-20

- **7 chart types** drawn in the terminal: bars, columns, grouped, stacked, sparklines, scatter and heat maps. A label ending in `*` is highlighted; a title with "lower is better" highlights the lowest value.
- **Charts and flows never fold** behind **▸ Details**: you asked for them.
- **Flows are one graph:** each step drawn once, side exits as branch lines, loops marked; flows longer than 6 steps use one line per step.
- **The fold counts wrapped lines**, so long replies fold after about 18 lines on screen. `Also` labels with a note ("**Also (not changed):**") are boxed too.
- **README:** real before/after terminal recordings for 7 kinds of request, captured with `docs/shots/record.sh`.

## 0.5.0 · 2026-10-20

- **Display mod in the plugin:** the answer line framed as a card, `Also` dimmed, `❓ Needs you` and `⚠ Risk` as callouts, Needs-you pinned above the prompt, long details folded behind **▸ Details**, test bars, and `flow` / `chart` blocks drawn as boxes and bars. Display only, 0 tokens.
- **Diagrams and charts on request:** the rules use `flow` and `chart` blocks only when you ask. Using them by default kept fewer facts in our test (86% vs 97%), so that stayed out.
- Rules otherwise unchanged from 0.4.0, so its numbers stand.

## 0.4.0 · 2026-10-20

- **Rewritten short:** 7 rules and one example, about 500 tokens (was ~1.2k), keeping the strict first-screen rule.
- **Thinking is back to default's level:** 3,591 tokens per question (0.3.1: 4,321; default 3,484). Steps: 15.5 (default 14.7), so no less digging.
- First 12: **78%**. Facts kept: **97%** (default 94%, Concise 85%). Walls of text: 0. Time: 132 s (0.3.1: 169 s).
- Tried and dropped: a 5-line "card" layout (first 12 fell to 54%) and the short rules without the first-screen rule (47%).

## 0.3.1 · 2026-10-20

- **Removed** the "Before you send" self-check list. Thinking dropped 16% (5,122 → 4,321 tokens per question), and facts stayed level.
- **Opt-in:** the style no longer forces itself over Concise or other plugins' styles. Turn it on with `/output-style skim:skim`.
- First 12: **77%** (Default 44%, Concise 69%). Facts kept: 87%.

## 0.3 · 2026-10-20

- **Answer the question asked.** A "how does X work" question gets the steps first, and unrequested findings go in one `Also:` line.
- **Every first-screen line carries a fact.** Headings and diagrams come after.
- First 12: 75%, up from 61%.

## 0.2 · 2026-10-20

- **The first 8 lines must answer completely.** Reviews list every finding as one line first.
- **`Needs you` / `Risk` only when real.** v0.1 added them to 8 of 10 replies.
- First 12: 61%, up from 43%. Walls of text: 1 in 10 replies.

## 0.1 · 2026-10-20

- First version: an output style (answer first, the right shape per content, bold anchors, a "never drop" list), a local Stop hook, `/skim:stats` and `AGENTS.md` for other agents.

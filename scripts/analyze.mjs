// Measures how skimmable a reply is. Pure function, no I/O, so the Stop hook,
// /skim-stats and the eval runner all score replies the same way.

const WALL_WORDS = 60;      // a prose paragraph longer than this is a wall of text
const LONG_BULLET_WORDS = 40;
const BOLD_SENTENCE_WORDS = 12;
const SCREEN_LINES = 40;
const MAX_TABLE_COLS = 4;

const words = (s) => (s.match(/\S+/g) || []).length;
const isListItem = (l) => /^\s*([-*+]|\d+[.)])\s+/.test(l);
const isTableRow = (l) => /^\s*\|/.test(l);
const isHeading = (l) => /^\s*#{1,6}\s/.test(l);
const isRule = (l) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);

export function analyze(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');

  // Separate code blocks from prose; code is verbatim payload and never counts as a wall.
  const prose = [];
  let inCode = false, codeBlocks = 0, mermaid = false;
  for (const l of lines) {
    const fence = l.match(/^\s*(```|~~~)\s*([\w-]*)/);
    if (fence) {
      if (!inCode) { codeBlocks++; if (fence[2] === 'mermaid') mermaid = true; }
      inCode = !inCode;
      prose.push('');
      continue;
    }
    prose.push(inCode ? '' : l);
  }

  const first = lines.find((l) => l.trim()) || '';
  // Line 1 counts as "answer first" when it opens with bold, optionally after a marker or heading.
  const answerFirst = /^\s*(#{1,6}\s*)?([✓✗⚠❓]️?\s*)?\*\*\S/.test(first);

  let tables = 0, maxTableCols = 0, walls = 0, longBullets = 0;
  let para = [];
  const flush = () => {
    if (para.length && words(para.join(' ')) > WALL_WORDS) walls++;
    para = [];
  };
  for (let i = 0; i < prose.length; i++) {
    const l = prose[i];
    if (!l.trim() || isHeading(l) || isRule(l)) { flush(); continue; }
    if (isTableRow(l)) {
      flush();
      if (!isTableRow(prose[i - 1] || '')) {
        tables++;
        const cols = l.trim().replace(/^\||\|$/g, '').split('|').length;
        maxTableCols = Math.max(maxTableCols, cols);
      }
      continue;
    }
    if (isListItem(l)) {
      flush();
      if (words(l) > LONG_BULLET_WORDS) longBullets++;
      continue;
    }
    para.push(l);
  }
  flush();

  const boldSpans = [...prose.join('\n').matchAll(/\*\*([^*\n]+)\*\*/g)].map((m) => m[1]);

  return {
    lines: lines.length,
    words: words(prose.join(' ')),
    answerFirst,
    walls,
    longBullets,
    tables,
    maxTableCols,
    wideTables: maxTableCols > MAX_TABLE_COLS,
    codeBlocks,
    mermaid,
    bold: boldSpans.length,
    boldSentences: boldSpans.filter((s) => words(s) > BOLD_SENTENCE_WORDS).length,
    needsYou: /❓|needs you/i.test(text),
    risk: /⚠/.test(text),
    fitsScreen: lines.length <= SCREEN_LINES,
  };
}

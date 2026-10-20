// Rendered terminal rows. A source line longer than the terminal width wraps onto several rows,
// so "lines" undercounts the screen taken by answers that put a whole paragraph on one line.
export const COLS = 100;
export const rowsOf = (line, cols = COLS) => Math.max(1, Math.ceil([...line].length / cols));
export const renderedRows = (text, cols = COLS) => String(text).replace(/\n$/, '').split('\n').reduce((n, l) => n + rowsOf(l, cols), 0);
// The first `limit` rendered rows, cut at a line boundary (the first line is always kept).
export function firstRows(text, limit, cols = COLS) {
  const out = [];
  let used = 0;
  for (const l of String(text).replace(/\n$/, '').split('\n')) {
    const r = rowsOf(l, cols);
    if (out.length && used + r > limit) break;
    out.push(l);
    used += r;
  }
  return out.join('\n');
}

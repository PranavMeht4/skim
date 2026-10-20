// Splits a skim reply into the parts the card draws differently. Pure, so the
// tests and every surface read a reply the same way. A reply with no bold answer
// line (interim notes, other styles) is left to the engine.
//
// A reply can hold several cards: a `---` line starts a new section, and each
// section that opens with a bold line gets its own card. An italic line right
// above that bold line is drawn as the card's label.

export type Tone = 'success' | 'error' | 'warning' | 'suggestion' | 'claude'

export type Segment =
  | { kind: 'label'; text: string }
  | { kind: 'head'; text: string; tone: Tone }
  | { kind: 'md'; text: string }
  | { kind: 'callout'; text: string; tone: Tone }
  | { kind: 'also'; text: string }
  | { kind: 'rule' }

const HEAD = /^\s*(?:[✓✗⚠❓]️?\s*)?\*\*\S/
const LABEL = /^\s*\*[^*\s][^*]*\*\s*$/
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const FENCE = /^\s*(```|~~~)/
// "**Also:**", and variants like "**Also (not changed):**".
const ALSO = /^\s*\*\*Also\b[^*\n]*\*\*/
const NEEDS = /^\s*❓/
const RISK = /^\s*⚠/
const ITEM = /^\s*([-*+]|\d+[.)])\s/
const INDENTED = /^\s{2,}\S/

const toneOf = (line: string): Tone =>
  line.includes('✗') ? 'error' : line.includes('⚠') ? 'warning' : line.includes('✓') ? 'success' : 'claude'

// Splits on rules outside code blocks.
function sections(lines: string[]): string[][] {
  const out: string[][] = [[]]
  let inFence = false
  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence
    if (!inFence && RULE.test(line)) out.push([])
    else out[out.length - 1]?.push(line)
  }
  return out
}

function section(lines: string[]): Segment[] {
  const out: Segment[] = []
  let md: string[] = []
  const flush = () => {
    const t = md.join('\n').trim()
    if (t) out.push({ kind: 'md', text: t })
    md = []
  }

  const filled = lines.map((l, i) => [l, i] as const).filter(([l]) => l.trim() !== '')
  let i = 0
  const [first, firstAt] = filled[0] ?? ['', -1]
  const [second, secondAt] = filled[1] ?? ['', -1]
  if (LABEL.test(first) && HEAD.test(second)) {
    out.push({ kind: 'label', text: first.trim() }, { kind: 'head', text: second.trim(), tone: toneOf(second) })
    i = secondAt + 1
  } else if (HEAD.test(first)) {
    out.push({ kind: 'head', text: first.trim(), tone: toneOf(first) })
    i = firstAt + 1
  }

  let inFence = false
  for (; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (FENCE.test(line)) inFence = !inFence
    if (inFence || FENCE.test(line)) {
      md.push(line)
      continue
    }
    if (NEEDS.test(line) || RISK.test(line)) {
      flush()
      out.push({ kind: 'callout', text: line.trim(), tone: NEEDS.test(line) ? 'suggestion' : 'warning' })
      continue
    }
    if (ALSO.test(line)) {
      flush()
      // The block runs over its list items and their wrapped lines, across
      // blank lines only while the next line is still an item.
      const block = [line]
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j] ?? ''
        const after = lines[j + 1] ?? ''
        if (ITEM.test(next) || INDENTED.test(next)) block.push(next)
        else if (next.trim() === '' && (ITEM.test(after) || INDENTED.test(after))) block.push(next)
        else break
        j++
      }
      out.push({ kind: 'also', text: block.join('\n').trim() })
      i = j - 1
      continue
    }
    md.push(line)
  }
  flush()
  return out
}

export function parse(text: string): Segment[] | null {
  const parts = sections(text.replace(/\r/g, '').split('\n')).map(section).filter(s => s.length > 0)
  if (!parts.some(s => s.some(p => p.kind === 'head'))) return null
  return parts.flatMap((s, k) => (k === 0 ? s : [{ kind: 'rule' } as const, ...s]))
}

// The first "❓ Needs you" line of a final answer, for the band above the prompt.
export function needsYou(text: string): string | null {
  let inFence = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    if (!inFence && NEEDS.test(line)) return line.trim()
  }
  return null
}

// ── Blocks inside a markdown segment: plain markdown, a chart, a flow ──

export type ChartType = 'bars' | 'columns' | 'grouped' | 'stacked' | 'spark' | 'scatter' | 'heat'
export type ChartRow = { label: string; values: number[]; shown: string[]; mark: boolean }
export type Chart = {
  kind: 'chart'
  type: ChartType
  title: string | null
  lowerBetter: boolean
  // Series names (grouped, stacked), column names (heat) or axis names (scatter).
  names: string[]
  rows: ChartRow[]
  lines: number
}
export type Block =
  | { kind: 'md'; text: string; lines: number }
  | Chart
  | { kind: 'flow'; chains: string[][]; lines: number }

const TYPES: ChartType[] = ['bars', 'columns', 'grouped', 'stacked', 'spark', 'scatter', 'heat']
const NUM = /^-?[\d,]*\.?\d+$/

// ```chart [type]: an optional `# title`, an optional `# series|cols|axes: a, b`,
// then one `label: value` row per line. Multi-value types separate values with
// ", " (spark also takes spaces). A label ending in * is highlighted.
function chart(info: string, body: string[]): Chart | null {
  const type = (TYPES as string[]).includes(info) ? (info as ChartType) : info === '' ? 'bars' : null
  if (!type) return null
  let title: string | null = null
  let names: string[] = []
  const rows: ChartRow[] = []
  for (const line of body) {
    if (!line.trim()) continue
    const meta = line.match(/^\s*#\s*(series|cols|columns|axes)\s*:\s*(.+)$/i)
    if (meta) { names = meta[2]!.split(',').map(x => x.trim()).filter(Boolean); continue }
    const t = line.match(/^\s*#\s+(.+)$/)
    if (t && rows.length === 0 && title === null) { title = t[1]!.trim(); continue }
    const m = line.match(/^\s*(.+?)\s*[:|]\s*(.+)$/)
    if (!m) return null
    // A separating comma has a space after it, so "3,591" stays one number.
    const raw = m[2]!.trim()
    const parts = (type === 'bars' || type === 'columns' ? [raw] : raw.split(type === 'spark' ? /[\s;]+|,\s+/ : /\s*;\s*|,\s+/))
      .map(x => x.trim())
      .filter(Boolean)
    const nums = parts.map(x => x.match(/^(-?[\d,]*\.?\d+)\s*(.*)$/))
    if (!nums.length || nums.some(n => !n || !NUM.test(n[1]!))) return null
    let label = m[1]!.trim()
    const mark = label.endsWith('*')
    if (mark) label = label.slice(0, -1).trim()
    rows.push({ label, mark, values: nums.map(n => Number(n![1]!.replace(/,/g, ''))), shown: parts })
  }
  if (!rows.length) return null
  const lowerBetter = /lower is better|less is better/i.test(title ?? '')
  const tall = type === 'columns' ? 11 : type === 'scatter' ? 16 : type === 'grouped' ? rows.length * (names.length + 1) : rows.length
  return { kind: 'chart', type, title, lowerBetter, names, rows, lines: tall + (title ? 1 : 0) }
}

// ```flow: one chain per line, steps joined by -> (or →).
function flow(body: string[]): Block | null {
  const chains = body
    .filter(l => l.trim())
    .map(l => l.split(/\s*(?:->|→|─►)\s*/).map(s => s.trim()).filter(Boolean))
  if (!chains.length || chains.some(c => c.length < 2)) return null
  return { kind: 'flow', chains, lines: chains.reduce((n, c) => n + c.length * 3, 0) }
}

export function blocks(md: string): Block[] {
  const out: Block[] = []
  const lines = md.split('\n')
  let buf: string[] = []
  const flush = () => {
    // Paragraphs stay separate so the fold can fall between them.
    for (const para of buf.join('\n').split(/\n\s*\n/)) {
      const t = para.trim()
      if (t) out.push({ kind: 'md', text: t, lines: t.split('\n').length })
    }
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const open = (lines[i] ?? '').match(/^\s*```\s*([\w-]*)(?:\s+([\w-]+))?\s*$/)
    if (!open) { buf.push(lines[i] ?? ''); continue }
    let j = i + 1
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j] ?? '')) j++
    const body = lines.slice(i + 1, j)
    const lang = open[1]
    const special = lang === 'chart' ? chart(open[2] ?? '', body) : lang === 'flow' ? flow(body) : null
    if (special) {
      flush()
      out.push(special)
    } else {
      // Any other code block stays whole, inside one markdown block.
      flush()
      const t = lines.slice(i, j + 1).join('\n')
      out.push({ kind: 'md', text: t, lines: body.length + 2 })
    }
    i = j
  }
  flush()
  return out
}

// "41/42 tests pass" in a headline, for the bar under it.
export function testCount(text: string): { passed: number; total: number } | null {
  const m = text.match(/(\d+)\s*\/\s*(\d+)\s+tests?\b/i)
  if (!m) return null
  const passed = Number(m[1]), total = Number(m[2])
  return total > 0 && passed <= total ? { passed, total } : null
}

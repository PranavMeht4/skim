// Draws a ```flow block as one graph: each step once, the main path top to bottom,
// side exits as short branch lines, and merges marked with where they come from.
import type { ElementTable } from 'claude-code'

type El = Pick<ElementTable<'terminal'>, 'Box' | 'Text'>

const toneOf = (s: string) => (/✗|BUG|fail|error|wrong|\b4\d\d\b|\b5\d\d\b/i.test(s) ? 'error' : /✓|\bok\b|success/i.test(s) ? 'success' : 'claude')

export function layoutFlow(chains: string[][]) {
  const nodes: string[] = []
  const out = new Map<string, string[]>()
  const into = new Map<string, string[]>()
  const link = (m: Map<string, string[]>, a: string, b: string) => {
    const list = m.get(a) ?? []
    if (!list.includes(b)) list.push(b)
    m.set(a, list)
  }
  for (const chain of chains) {
    for (const s of chain) if (!nodes.includes(s)) nodes.push(s)
    for (let i = 0; i + 1 < chain.length; i++) {
      link(out, chain[i]!, chain[i + 1]!)
      link(into, chain[i + 1]!, chain[i]!)
    }
  }
  // Depth first from the starts, first exit first: that is the main path.
  const seq: string[] = []
  const seen = new Set<string>()
  const visit = (n: string) => {
    if (seen.has(n)) return
    seen.add(n)
    seq.push(n)
    for (const c of out.get(n) ?? []) visit(c)
  }
  const starts = nodes.filter(n => !(into.get(n)?.length))
  for (const s of starts.length ? starts : nodes.slice(0, 1)) visit(s)
  for (const n of nodes) visit(n)
  // A dead end reached only from the side is drawn inline as a branch, not as a box.
  const inline = new Set(
    seq.filter((n, i) => !(out.get(n)?.length) && !(into.get(n) ?? []).includes(seq[i - 1] ?? '') && (into.get(n)?.length ?? 0) > 0),
  )
  const boxes = seq.filter(n => !inline.has(n))
  return { boxes, out, into, inline }
}

// Up to this many steps get framed boxes; longer flows use one line per step.
const BOXED = 6

export function drawFlow(chains: string[][], k: string, { Box, Text }: El) {
  const { boxes, out, into, inline } = layoutFlow(chains)
  const compact = boxes.length > BOXED
  return (
    <Box key={k} flexDirection="column" paddingX={1}>
      {boxes.flatMap((n, i) => {
        const prev = boxes[i - 1]
        const next = boxes[i + 1]
        // Edges that loop back are marked at their target; edges that skip ahead, at their source.
        const from = (into.get(n) ?? []).filter(s => s !== prev && boxes.indexOf(s) > i)
        const exits = (out.get(n) ?? []).filter(t => t !== next && (inline.has(t) || boxes.indexOf(t) > i))
        const rows = [
          <Box key={`${k}n${i}`} flexDirection="row" alignItems="center">
            {compact ? (
              <Text>
                <Text color={toneOf(n)}>● </Text>
                {n}
              </Text>
            ) : (
              <Box borderStyle="round" borderColor={toneOf(n)} paddingX={1}>
                <Text>{n}</Text>
              </Box>
            )}
            {from.length ? <Text dimColor>  ◄ from {from.join(', ')}</Text> : null}
          </Box>,
          ...exits.map((t, j) => (
            <Box key={`${k}n${i}x${j}`}>
              <Text dimColor>{compact ? '│ ├─► ' : '   ├─► '}</Text>
              <Text color={toneOf(t)}>{inline.has(t) ? t : `${t} ↓`}</Text>
            </Box>
          )),
        ]
        const linked = next !== undefined && (out.get(n) ?? []).includes(next)
        if (next) rows.push(<Text key={`${k}n${i}a`} dimColor>{linked ? (compact ? '│' : '   │\n   ▼') : ' '}</Text>)
        return rows
      })}
    </Box>
  )
}

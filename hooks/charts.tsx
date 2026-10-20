// Draws a ```chart block with terminal-safe Box and Text only, so every surface
// can show it. One function per chart type; `width` is the columns available.
import type { ElementTable } from 'claude-code'

import type { Chart, ChartRow } from './parse'

type El = Pick<ElementTable<'terminal'>, 'Box' | 'Text'>

const HIGHLIGHT = 'success'
const NEUTRAL = 'suggestion'
const SERIES = ['suggestion', 'success', 'warning', 'claude', 'merged', 'error']
const MARKERS = ['●', '▲', '■', '◆', '★', '✚', '✱', '⬟']
const HEAT = ['#8b2a2a', '#a8551c', '#a68a1a', '#5f8f2a', '#2e8b4a']
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const SPARKS = '▁▂▃▄▅▆▇█'
const UPS = ' ▁▂▃▄▅▆▇█'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s.padEnd(n))

// A bar of `cells` length with eighth-block precision.
const bar = (cells: number) => {
  const whole = Math.floor(cells)
  return '█'.repeat(whole) + (EIGHTHS[Math.round((cells - whole) * 8)] ?? '')
}

// Marked rows win; otherwise the best value (max, or min when lower is better).
function colorOf(c: Chart): (row: ChartRow) => string {
  if (c.rows.some(r => r.mark)) return r => (r.mark ? HIGHLIGHT : NEUTRAL)
  const vals = c.rows.map(r => r.values[0] ?? 0)
  const best = c.lowerBetter ? Math.min(...vals) : Math.max(...vals)
  return r => ((r.values[0] ?? 0) === best ? HIGHLIGHT : NEUTRAL)
}

export function drawChart(c: Chart, k: string, width: number, { Box, Text }: El) {
  const labelW = clamp(Math.max(...c.rows.map(r => r.label.length)), 4, 20)
  const legend = (names: string[]) => (
    <Box key={`${k}lg`} flexDirection="row" gap={2}>
      {names.map((n, i) => (
        <Text key={`${k}lg${i}`} color={SERIES[i % SERIES.length]}>
          █ <Text>{n}</Text>
        </Text>
      ))}
    </Box>
  )
  const title = c.title ? <Text key={`${k}t`} bold>{c.title}</Text> : null
  const color = colorOf(c)
  let body

  if (c.type === 'bars') {
    const max = Math.max(...c.rows.map(r => Math.abs(r.values[0] ?? 0)), 1e-9)
    const shownW = Math.max(...c.rows.map(r => (r.shown[0] ?? '').length))
    const barW = clamp(width - labelW - shownW - 6, 8, 44)
    body = c.rows.map((r, i) => (
      <Box key={`${k}r${i}`}>
        <Text>{pad(r.label, labelW)} </Text>
        <Text color={color(r)}>{bar(Math.max(0.15, (Math.abs(r.values[0] ?? 0) / max) * barW))}</Text>
        <Text dimColor> {r.shown[0]}</Text>
      </Box>
    ))
  } else if (c.type === 'columns') {
    const H = 8
    const max = Math.max(...c.rows.map(r => Math.abs(r.values[0] ?? 0)), 1e-9)
    const colW = clamp(Math.max(...c.rows.map(r => Math.max(r.label.length, (r.shown[0] ?? '').length))), 3, 10) + 1
    const eighths = c.rows.map(r => Math.max(1, Math.round((Math.abs(r.values[0] ?? 0) / max) * H * 8)))
    const level = (e: number, row: number) => {
      const left = e - row * 8
      return left >= 8 ? '█' : left <= 0 ? ' ' : UPS[left]!
    }
    body = [
      <Box key={`${k}v`}>{c.rows.map((r, i) => <Text key={`${k}v${i}`} dimColor>{pad(r.shown[0] ?? '', colW)}</Text>)}</Box>,
      ...Array.from({ length: H }, (_, n) => H - 1 - n).map(row => (
        <Box key={`${k}h${row}`}>
          {c.rows.map((r, i) => (
            <Text key={`${k}h${row}c${i}`} color={color(r)}>{level(eighths[i]!, row).repeat(colW - 1) + ' '}</Text>
          ))}
        </Box>
      )),
      <Box key={`${k}l`}>{c.rows.map((r, i) => <Text key={`${k}l${i}`} bold={r.mark}>{pad(r.label, colW)}</Text>)}</Box>,
    ]
  } else if (c.type === 'grouped') {
    const names = c.names.length ? c.names : (c.rows[0]?.values ?? []).map((_, i) => `#${i + 1}`)
    const max = Math.max(...c.rows.flatMap(r => r.values.map(Math.abs)), 1e-9)
    const nameW = clamp(Math.max(...names.map(n => n.length)), 2, 24)
    const barW = clamp(width - nameW - 12, 8, 40)
    body = [
      legend(names),
      ...c.rows.map((r, i) => (
        <Box key={`${k}g${i}`} flexDirection="column">
          <Text bold>{r.label}</Text>
          {r.values.map((v, s) => (
            <Box key={`${k}g${i}s${s}`}>
              <Text dimColor>  {pad(names[s] ?? '', nameW)} </Text>
              <Text color={SERIES[s % SERIES.length]}>{bar(Math.max(0.15, (Math.abs(v) / max) * barW))}</Text>
              <Text dimColor> {r.shown[s]}</Text>
            </Box>
          ))}
        </Box>
      )),
    ]
  } else if (c.type === 'stacked') {
    const names = c.names.length ? c.names : (c.rows[0]?.values ?? []).map((_, i) => `#${i + 1}`)
    const totals = c.rows.map(r => r.values.reduce((a, b) => a + Math.max(0, b), 0))
    const maxTotal = Math.max(...totals, 1e-9)
    const barW = clamp(width - labelW - 12, 10, 48)
    body = [
      legend(names),
      ...c.rows.map((r, i) => (
        <Box key={`${k}s${i}`}>
          <Text bold={r.mark}>{pad(r.label, labelW)} </Text>
          {r.values.map((v, s) => (
            <Text key={`${k}s${i}p${s}`} color={SERIES[s % SERIES.length]}>{'█'.repeat(Math.round((Math.max(0, v) / maxTotal) * barW))}</Text>
          ))}
          <Text dimColor> {Math.round(totals[i]!).toLocaleString('en-US')}</Text>
        </Box>
      )),
    ]
  } else if (c.type === 'spark') {
    body = c.rows.map((r, i) => {
      const lo = Math.min(...r.values)
      const hi = Math.max(...r.values)
      const line = r.values.map(v => (hi === lo ? SPARKS[3] : SPARKS[Math.round(((v - lo) / (hi - lo)) * 7)])).join('')
      return (
        <Box key={`${k}p${i}`}>
          <Text>{pad(r.label, labelW)} </Text>
          <Text color={r.mark || !c.rows.some(x => x.mark) ? HIGHLIGHT : NEUTRAL}>{line}</Text>
          <Text dimColor>  {r.shown[0]} → {r.shown[r.shown.length - 1]}</Text>
        </Box>
      )
    })
  } else if (c.type === 'scatter') {
    const W = clamp(width - 14, 20, 56)
    const H = 12
    const xs = c.rows.map(r => r.values[0] ?? 0)
    const ys = c.rows.map(r => r.values[1] ?? 0)
    const span = (v: number[]) => {
      const lo = Math.min(...v), hi = Math.max(...v), p = (hi - lo || 1) * 0.08
      return [lo - p, hi + p] as const
    }
    const [x0, x1] = span(xs)
    const [y0, y1] = span(ys)
    const grid: (number | null)[][] = Array.from({ length: H }, () => Array(W).fill(null))
    c.rows.forEach((_, i) => {
      const cx = clamp(Math.round(((xs[i]! - x0) / (x1 - x0)) * (W - 1)), 0, W - 1)
      const cy = clamp(Math.round(((y1 - ys[i]!) / (y1 - y0)) * (H - 1)), 0, H - 1)
      grid[cy]![cx] = i
    })
    const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10))
    const yl = [fmt(y1), fmt(y0)]
    const ylW = Math.max(...yl.map(s => s.length))
    body = [
      ...grid.map((cells, r) => (
        <Box key={`${k}y${r}`}>
          <Text dimColor>{(r === 0 ? yl[0]! : r === H - 1 ? yl[1]! : '').padStart(ylW)} │</Text>
          {cells.map((p, x) =>
            p === null ? <Text key={`${k}y${r}x${x}`}> </Text> : (
              <Text key={`${k}y${r}x${x}`} color={SERIES[p % SERIES.length]} bold>{MARKERS[p % MARKERS.length]}</Text>
            ),
          )}
        </Box>
      )),
      <Text key={`${k}xa`} dimColor>{' '.repeat(ylW + 1)}└{'─'.repeat(W)}</Text>,
      <Text key={`${k}xl`} dimColor>{' '.repeat(ylW + 2)}{fmt(x0).padEnd(W - fmt(x1).length)}{fmt(x1)}</Text>,
      c.names.length >= 2 ? <Text key={`${k}an`} dimColor>{' '.repeat(ylW + 2)}x: {c.names[0]} · y: {c.names[1]}</Text> : null,
      <Box key={`${k}lgd`} flexDirection="row" flexWrap="wrap" columnGap={2}>
        {c.rows.map((r, i) => (
          <Text key={`${k}lgd${i}`} color={SERIES[i % SERIES.length]}>
            {MARKERS[i % MARKERS.length]} <Text bold={r.mark}>{r.label}</Text>
            <Text dimColor> ({r.shown.join(', ')})</Text>
          </Text>
        ))}
      </Box>,
    ]
  } else {
    // heat: rows × columns, each cell shaded from worst to best.
    const all = c.rows.flatMap(r => r.values)
    const lo = Math.min(...all), hi = Math.max(...all)
    const cellW = clamp(Math.max(...c.names.map(n => n.length), ...c.rows.flatMap(r => r.shown.map(s => s.length))) + 2, 5, 12)
    const shade = (v: number) => {
      const t = hi === lo ? 1 : (v - lo) / (hi - lo)
      return HEAT[Math.round((c.lowerBetter ? 1 - t : t) * (HEAT.length - 1))]!
    }
    const center = (s: string) => {
      const left = Math.floor((cellW - s.length) / 2)
      return ' '.repeat(Math.max(0, left)) + s + ' '.repeat(Math.max(0, cellW - s.length - left))
    }
    body = [
      <Box key={`${k}hh`}>
        <Text>{' '.repeat(labelW + 1)}</Text>
        {c.names.map((n, j) => <Text key={`${k}hh${j}`} bold>{center(n.slice(0, cellW))}</Text>)}
      </Box>,
      ...c.rows.map((r, i) => (
        <Box key={`${k}hr${i}`}>
          <Text bold={r.mark}>{pad(r.label, labelW)} </Text>
          {r.values.map((v, j) => (
            <Text key={`${k}hr${i}c${j}`} color="#ffffff" backgroundColor={shade(v)}>{center(r.shown[j] ?? '')}</Text>
          ))}
        </Box>
      )),
    ]
  }

  return (
    <Box key={k} flexDirection="column" paddingX={1}>
      {title}
      {body}
    </Box>
  )
}

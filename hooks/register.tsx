import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { NeedsYou } from '../types'
import { drawChart } from './charts'
import { drawFlow } from './flow'
import { blocks, needsYou, parse, testCount } from './parse'
import type { Block, Segment } from './parse'

const pending = atom({ plugin: 'skim', key: 'needsYou' } as const, null as NeedsYou)
// One flag per message: whether its details are open.
const expanded = atom({ plugin: 'skim', key: 'expanded' } as const, false)

// Terminal rows of body shown before the fold. skim puts every key fact in the first 8 lines.
const BUDGET = 18

type Item = { seg: Segment; block?: Block }

const rowsOf = (text: string, columns: number) =>
  text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(20, columns - 6))), 0)

export const register: Register = on => {
  // The reply as cards. Display only: Claude and the transcript keep the text.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = parse(e.props.text)
    if (!parts) return next(e)

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 80
    const open = await read($, memberOf(expanded, e))


    // Body blocks past the budget fold away; heads, Also and callouts never do.
    const items: Item[] = parts.flatMap(seg => (seg.kind === 'md' ? blocks(seg.text).map(block => ({ seg, block })) : [{ seg }]))
    let used = 0
    let folded = 0
    let foldAt = -1
    // Charts and flows were asked for, so they never fold and don't use up the budget.
    const visual = (it: Item) => it.block !== undefined && it.block.kind !== 'md'
    items.forEach((it, i) => {
      if (it.seg.kind === 'rule') used = 0
      if (!it.block || visual(it)) return
      // Long lines wrap, so count the rows they take, not the source lines.
      const rows = it.block.kind === 'md' ? rowsOf(it.block.text, columns) : it.block.lines
      if (used >= BUDGET) {
        folded += rows
        if (foldAt < 0) foldAt = i
      }
      used += rows
    })
    const canFold = folded >= 4

    const draw = (it: Item, k: string) => {
      const p = it.seg
      if (it.block) {
        if (it.block.kind === 'chart') return drawChart(it.block, k, columns, { Box, Text })
        if (it.block.kind === 'flow') return drawFlow(it.block.chains, k, { Box, Text })
        return <Markdown key={k} text={it.block.text} />
      }
      if (p.kind === 'rule') return <Text key={k} dimColor>{'─'.repeat(Math.max(10, Math.min(72, columns - 6)))}</Text>
      if (p.kind === 'label') return <Text key={k} dimColor italic>{p.text.replace(/^\s*\*|\*\s*$/g, '')}</Text>
      if (p.kind === 'head') {
        const tests = testCount(p.text)
        const cells = 24
        const good = tests ? Math.round((tests.passed / tests.total) * cells) : 0
        return (
          <Box key={k} borderStyle="round" borderColor={p.tone} paddingX={1} flexDirection="column">
            <Markdown text={p.text} />
            {tests ? (
              <Box>
                <Text color="success">{'█'.repeat(good)}</Text>
                <Text color="error">{'█'.repeat(cells - good)}</Text>
                <Text dimColor> {tests.passed}/{tests.total} tests</Text>
              </Box>
            ) : null}
          </Box>
        )
      }
      if (p.kind === 'callout') {
        return (
          <Box key={k} borderStyle="round" borderColor={p.tone} paddingX={1}>
            <Markdown text={p.text} />
          </Box>
        )
      }
      if (p.kind === 'also') {
        return (
          <Box key={k} borderStyle="single" borderColor="subtle" paddingX={1}>
            <Markdown text={p.text} dimColor />
          </Box>
        )
      }
      return null
    }

    const toggle = (
      <Button
        key="details"
        label={open ? '▾ Hide details' : `▸ Details · ${folded} more lines`}
        onPress={() => update($, memberOf(expanded, e), v => !v)}
      />
    )

    return (
      <Box flexDirection="column" gap={1}>
        {items.flatMap((it, i) => {
          const hidden = canFold && !open && i >= foldAt && it.block !== undefined && !visual(it)
          return [canFold && i === foldAt ? toggle : null, hidden ? null : draw(it, `i${i}`)]
        })}
      </Box>
    )
  })

  // "❓ Needs you" stays pinned above the prompt until the next prompt.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) await update($, pending, () => needsYou(e.answer))
    return next(e)
  })

  // Never refuses a prompt: if clearing the band fails, the prompt goes on.
  on('prompt.submit', async ($, e, next) => {
    await update($, pending, () => null)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, pending)
    if (!text || e.props.hasSurvey) return next(e)

    const { Box, Markdown } = $.ui.resolve(e)

    return (
      <Box borderStyle="round" borderColor="suggestion" paddingX={1}>
        <Markdown text={text} />
      </Box>
    )
  })
}

import { expect, test } from 'claude-code/testing'

import { layoutFlow } from './flow'
import { blocks, needsYou, parse, testCount } from './parse'

const reply = [
  '**✓ Search injection fixed. 13/13 tests pass.**',
  '',
  '- `src/api.js:30`: placeholders now',
  '',
  '**Also:**',
  '- **No auth** on these routes.',
  '- `%` still acts as a wildcard.',
  '',
  '**1. Detail.** More text.',
  '',
  '❓ **Needs you:** ship it now or after review?',
].join('\n')

test('splits a skim reply into head, body, also and callouts', async () => {
  const parts = parse(reply)
  expect(parts?.map(p => p.kind)).toEqual(['head', 'md', 'also', 'md', 'callout'])
  expect(parts?.[0]).toMatchObject({ kind: 'head', tone: 'success' })
  expect(parts?.[2]?.text).toContain('wildcard')
  expect(parts?.[2]?.text).not.toContain('Detail')
  expect(parts?.[4]).toMatchObject({ kind: 'callout', tone: 'suggestion' })
})

test('leaves replies without a bold answer line to the engine', async () => {
  expect(parse("I'll take a look at that.\n\n**Done.**")).toBeNull()
  expect(parse('')).toBeNull()
})

test('ignores markers inside code blocks', async () => {
  const parts = parse('**Answer.**\n\n```\n❓ not a callout\n**Also:** not a block\n```')
  expect(parts?.map(p => p.kind)).toEqual(['head', 'md'])
  expect(needsYou('```\n❓ no\n```')).toBeNull()
})

test('finds the Needs you line for the band', async () => {
  expect(needsYou(reply)).toBe('❓ **Needs you:** ship it now or after review?')
  expect(needsYou('**Done.**')).toBeNull()
})

test('draws a card on every surface', async $ => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'skim',
      surface,
      component: 'AssistantMessage',
      props: { text: reply, isFirstOfReply: true },
    })
    expect(await ui.find({ type: 'Markdown', text: /Search injection fixed/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /No auth/ })).toBeDefined()
    await ui.unmount()
  }
})

test('splits a reply into several cards on --- lines, with italic labels', async () => {
  const parts = parse('*Task done*\n**✓ Done.**\n\n---\n\n*Bug*\n**✗ Build fails.**\n\n```\n---\n```')
  expect(parts?.map(p => p.kind)).toEqual(['label', 'head', 'rule', 'label', 'head', 'md'])
  expect(parts?.[4]).toMatchObject({ tone: 'error' })
})

test('a plain first section stays markdown when a later one is a card', async () => {
  const parts = parse('Some intro.\n\n---\n\n**Answer.**')
  expect(parts?.map(p => p.kind)).toEqual(['md', 'rule', 'head'])
})

test('reads chart and flow blocks, keeps other code whole', async () => {
  const b = blocks('Intro.\n\n```chart\n# Thinking tokens\nDefault: 3484\nskim: 3402\n```\n\n```flow\nA -> B -> C\n```\n\n```js\nx()\n```')
  expect(b.map(x => x.kind)).toEqual(['md', 'chart', 'flow', 'md'])
  expect(b[1]).toMatchObject({ type: 'bars', title: 'Thinking tokens', rows: [{ label: 'Default', values: [3484] }, { label: 'skim', values: [3402] }] })
  expect(b[2]).toMatchObject({ chains: [['A', 'B', 'C']] })
})

test('reads a test count from a headline', async () => {
  expect(testCount('**✓ Fixed. 41/42 tests pass.**')).toEqual({ passed: 41, total: 42 })
  expect(testCount('**Done.**')).toBeNull()
})

test('folds long bodies behind a Details button that opens them', async $ => {
  const long = ['**Answer.**', '', ...Array.from({ length: 30 }, (_, i) => `Line ${i}.`).map(l => l + '\n')].join('\n')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'skim', surface, component: 'AssistantMessage', props: { text: long, isFirstOfReply: true } })
    expect(await ui.find({ type: 'Markdown', text: /Line 29/ })).toBeUndefined()
    await ui.press({ key: 'details' })
    expect(await ui.find({ type: 'Markdown', text: /Line 29/ })).toBeDefined()
    await ui.unmount()
  }
})

test('reads every chart type, its names and highlighted rows', async () => {
  const one = (src: string) => blocks(src)[0]
  expect(one('```chart stacked\n# series: reply, thinking\nskim*: 894, 3,591\nDefault: 1047, 3484\n```')).toMatchObject({
    type: 'stacked', names: ['reply', 'thinking'], rows: [{ label: 'skim', mark: true, values: [894, 3591] }, { label: 'Default', mark: false }],
  })
  expect(one('```chart spark\nfirst 12: 43 61 75 77 78\n```')).toMatchObject({ type: 'spark', rows: [{ values: [43, 61, 75, 77, 78] }] })
  expect(one('```chart scatter\n# axes: facts, first 12\nskim: 97, 78\n```')).toMatchObject({ type: 'scatter', names: ['facts', 'first 12'] })
  expect(one('```chart heat\n# cols: A, B\nq1: 1, 2\n```')).toMatchObject({ type: 'heat', names: ['A', 'B'] })
  expect(one('```chart\n# Time (lower is better)\nskim: 132 s\n```')).toMatchObject({ type: 'bars', lowerBetter: true, rows: [{ shown: ['132 s'] }] })
  expect(one('```chart pie\na: 1\n```')).toMatchObject({ kind: 'md' })
})

test('draws every chart type on every surface', async $ => {
  const src = [
    '**Charts.**',
    '```chart columns\nDefault: 111 s\nskim*: 132 s\n```',
    '```chart grouped\n# series: kept, first 12\nskim: 97, 78\nDefault: 94, 44\n```',
    '```chart stacked\n# series: reply, thinking\nskim: 894, 3591\n```',
    '```chart spark\nfirst 12: 43 61 75 77 78\n```',
    '```chart scatter\n# axes: kept, first 12\nskim: 97, 78\nDefault: 94, 44\n```',
    '```chart heat\n# cols: Default, skim\nlookup: 2, 3\n```',
  ].join('\n\n')
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'skim', surface, component: 'AssistantMessage', props: { text: src, isFirstOfReply: true } })
    expect(await ui.find({ type: 'Text', text: /skim/ })).toBeDefined()
    await ui.unmount()
  }
})

test('an Also label may carry a note', async () => {
  const parts = parse('**Fixed.**\n\n**Also (not changed):**\n- one\n- two\n\nDone.')
  expect(parts?.map(p => p.kind)).toEqual(['head', 'also', 'md'])
})

test('a flow is drawn as one graph: each step once, side exits inline', async () => {
  const { boxes, inline } = layoutFlow([
    ['POST /reminders', 'createReminder', 'toUtcMs', 'rows[]'],
    ['createReminder', '400 missing field'],
    ['setInterval 30s', 'tick', 'rows[]'],
  ])
  expect(boxes).toEqual(['POST /reminders', 'createReminder', 'toUtcMs', 'rows[]', 'setInterval 30s', 'tick'])
  expect([...inline]).toEqual(['400 missing field'])
})

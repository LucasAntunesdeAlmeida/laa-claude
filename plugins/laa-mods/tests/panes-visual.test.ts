import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { decodeCells, DEFAULT_FG } from '../hooks/draw'
import { ALL_SURFACES, bash, commandRun, fakeRepo, PANE, ROOT, show, turnEnd } from './fake'
import type { Drawn, Fake } from './fake'

// The panes under `visuals: full` (the default): the bars, the legends, the filters, and under each finding
// its link and the code around it. What `visuals: minimal` draws instead is pinned in parity.test.ts.

const REVIEW_FILE = '.claude/laa/local/last-review.md'

// An invented source file of twelve lines, written with CRLF line ends.
const SOURCE = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\r\n')

// An invented saved review: two findings in one readable file, one in a file that is not there, one outside
// the repo, one in a file too large to read, and one already fixed.
const REVIEW = [
  '# Review · fix/invoice-500 against main',
  '',
  '## CRIT · internal/billing/invoice.go:3 · nil address dereference on legacy rows',
  '- fix: guard with addr == nil',
  '- status: open',
  '',
  '## HIGH · internal/billing/invoice.go:8 · query in a loop over line items',
  '- fix: preload with one join',
  '- status: open',
  '',
  '## MED · internal/billing/gone.go:3 · rounding differs from the ledger',
  '- status: open',
  '',
  '## LOW · ../other/secret.go:1 · shared helper logs the tenant',
  '- status: open',
  '',
  '## LOW · internal/billing/huge.go:1 · generated table is stale',
  '- fix: regenerate it',
  '- status: open',
  '',
  '## HIGH · internal/billing/pdf.go:12 · unescaped customer name',
  '- fix: escape it',
  '- status: fixed (abc1234)',
  '',
].join('\n')

const FILES = { [REVIEW_FILE]: REVIEW, 'internal/billing/invoice.go': SOURCE, 'internal/billing/huge.go': 'x' }
const SIZES = { 'internal/billing/huge.go': 2 * 1024 * 1024 }

const TITLES = {
  crit: 'nil address dereference on legacy rows',
  high: 'query in a loop over line items',
  med: 'rounding differs from the ledger',
  outside: 'shared helper logs the tenant',
  huge: 'generated table is stale',
}

// One CRIT, one HIGH, one MED, and two LOW across the 40 cells an 80-column pane gives the bar.
const SEVERITY_BAR = '█'.repeat(8) + '▓'.repeat(8) + '▒'.repeat(8) + '░'.repeat(16)
const SEVERITY_LEGEND = '█ CRIT 1 · ▓ HIGH 1 · ▒ MED 1 · ░ LOW 2'

const learning = (title: string, scope: string) => [
  `## 2026-01-10 · laa:fix · ${title}`,
  `- scope: ${scope}`,
  '- kind: correction',
  '- target: CLAUDE.md',
  `- signal: saw ${title}`,
  `- proposal: note ${title}`,
  '- status: open',
  '',
]

// Invented learnings: three local and two generic, with one already applied between them.
const LEARNINGS = [
  '# Learnings',
  '',
  ...learning('wrong test command', 'local'),
  ...learning('stale fixture path', 'local'),
  ...learning('old rule', 'local').map(line => line.replace('- status: open', '- status: applied (CLAUDE.md)')),
  ...learning('missed migration', 'generic'),
  ...learning('lint runs twice', 'local'),
  ...learning('no retry budget', 'generic'),
].join('\n')

const SCOPE_BAR = '▓'.repeat(24) + '░'.repeat(16)
const SCOPE_LEGEND = '▓ local 3 · ░ generic 2'

// A repo on a task branch with the engine's side of what these tests raise. Returns the fake's record,
// every text the plugin put in the prompt, and how many times the plugin wrote each of its values.
async function world($: Engine, on: On, f: Fake = {}) {
  const seen = fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, ...f })
  const filled: string[] = []
  const writes: Record<string, number> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = (writes[e.key] ?? 0) + 1
    return next(e)
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  await $.tool.call(bash('git status'))
  return { seen, filled, writes }
}

// Every element of a drawn tree with the given tag, in document order.
const all = (node: Drawn, type: string): Exclude<Drawn, string>[] => {
  if (typeof node === 'string') return []
  return [...(node.type === type ? [node] : []), ...((node.children ?? []) as Drawn[]).flatMap(child => all(child, type))]
}

// The element of a drawn tree with the given key.
const keyed = (node: Drawn, key: string): Exclude<Drawn, string> | undefined => {
  if (typeof node === 'string') return undefined
  if (node.props?.key === key) return node
  for (const child of (node.children ?? []) as Drawn[]) {
    const found = keyed(child, key)
    if (found) return found
  }
  return undefined
}

// A pane's legend: the one line of text that opens with a shade.
const legend = (ui: { find: (query: { type: string; text: RegExp }) => Promise<{ text: string } | undefined> }) =>
  ui.find({ type: 'Text', text: /^[█▓▒░] / })

describe('findings pane · visuals: full', () => {
  test('draws a link and the code around each finding it could read', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      const tree = (await ui.drawn()) as Drawn

      // The file was written with CRLF: the code carries none of it.
      expect(all(keyed(tree, 'finding0') ?? '', 'Code').map(c => c.props), surface).toEqual([
        { source: 'line 1\nline 2\nline 3\nline 4\nline 5', startLine: 1, path: 'internal/billing/invoice.go', wrap: 'truncate-end' },
      ])
      expect(all(keyed(tree, 'finding1') ?? '', 'Code').map(c => c.props), surface).toEqual([
        { source: 'line 6\nline 7\nline 8\nline 9\nline 10', startLine: 6, path: 'internal/billing/invoice.go', wrap: 'truncate-end' },
      ])
      // A missing file, a path outside the repo, and a 2 MB file: no code.
      for (const key of ['finding2', 'finding3', 'finding4']) expect(all(keyed(tree, key) ?? '', 'Code'), `${surface} ${key}`).toEqual([])

      // The terminal opens a `file:` link; the other surfaces are sent none and draw its label as text.
      if (surface === 'terminal') {
        expect(all(tree, 'Link').map(l => l.props)).toEqual([
          { href: 'file:///C:/r/internal/billing/invoice.go', label: 'internal/billing/invoice.go:3' },
          { href: 'file:///C:/r/internal/billing/invoice.go', label: 'internal/billing/invoice.go:8' },
          { href: 'file:///C:/r/internal/billing/gone.go', label: 'internal/billing/gone.go:3' },
          { href: 'file:///C:/other/secret.go', label: '../other/secret.go:1' },
          { href: 'file:///C:/r/internal/billing/huge.go', label: 'internal/billing/huge.go:1' },
        ])
      } else {
        expect(await ui.find({ type: 'Text', text: 'internal/billing/invoice.go:3' }), surface).toBeDefined()
      }
      expect(await ui.find({ type: 'Text', text: '→ guard with addr == nil' }), surface).toMatchObject({ props: { color: 'suggestion' } })
      expect(await ui.find({ type: 'Text', text: 'unescaped customer name' }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('draws the severity bar on the terminal and its legend everywhere', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      const tree = (await ui.drawn()) as Drawn
      expect(show(tree).split('\n')[1], surface).toBe(`  <Text dimColor>${JSON.stringify(ROOT)}</Text>`)
      expect((await legend(ui))?.text, surface).toBe(SEVERITY_LEGEND)
      const rasters = all(tree, 'Raster')
      if (surface !== 'terminal') {
        expect(rasters, surface).toEqual([])
      } else {
        expect(rasters.map(r => [r.props?.key, r.props?.columns, r.props?.rows])).toEqual([['severity-bar', 40, 1]])
        const cells = decodeCells(String(rasters[0]?.props?.cells))
        expect(cells.text).toBe(SEVERITY_BAR)
        expect(cells.fg).toEqual(Array(40).fill(DEFAULT_FG))
        expect(cells.bg).toEqual(Array(40).fill(DEFAULT_FG))
      }
      await ui.unmount()
    }
  })

  test('fits the bar to a narrow pane, and leaves it out where there is no room', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const narrow = await $.ui.mount({ ...PANE.findings, props: { ...PANE.findings.props, bodyColumns: 12 }, surface: 'terminal' })
    const bar = all((await narrow.drawn()) as Drawn, 'Raster')[0]
    expect(bar?.props?.columns).toBe(10)
    expect(decodeCells(String(bar?.props?.cells)).text).toBe('██▓▓▒▒░░░░')
    await narrow.unmount()

    const tiny = await $.ui.mount({ ...PANE.findings, props: { ...PANE.findings.props, bodyColumns: 4 }, surface: 'terminal' })
    expect(all((await tiny.drawn()) as Drawn, 'Raster')).toEqual([])
    expect((await legend(tiny))?.text).toBe(SEVERITY_LEGEND)
    await tiny.unmount()
  })

  test('uses no error color: CRIT and HIGH tags are in the warning color, the others in the default', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      const tree = (await ui.drawn()) as Drawn
      expect(show(tree), surface).not.toContain('error')
      const tags = ['finding0', 'finding1', 'finding2', 'finding3'].map(key => all(keyed(tree, key) ?? '', 'Text')[0])
      expect(tags.map(t => [t?.children?.[0], t?.props]), surface).toEqual([
        ['CRIT  ', { bold: true, color: 'warning' }],
        ['HIGH  ', { bold: true, color: 'warning' }],
        ['MED   ', { bold: true }],
        ['LOW   ', { bold: true }],
      ])
      await ui.unmount()
    }
  })

  test('the filter hides and shows findings, and running the command again resets it', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    const shown = async () => {
      const out: string[] = []
      for (const [name, title] of Object.entries(TITLES)) if (await ui.find({ type: 'Text', text: title })) out.push(name)
      return out
    }
    expect((await ui.find({ type: 'Select', key: 'severity' }))?.props).toMatchObject({
      value: 'all',
      options: [
        { value: 'all', label: 'all' },
        { value: 'high', label: 'CRIT+HIGH' },
        { value: 'med', label: 'MED' },
        { value: 'low', label: 'LOW' },
      ],
    })
    expect(await shown()).toEqual(['crit', 'high', 'med', 'outside', 'huge'])

    await ui.select({ key: 'severity', value: 'high' })
    expect(await shown()).toEqual(['crit', 'high'])
    expect((await ui.find({ key: 'severity' }))?.props.value).toBe('high')
    await ui.select({ key: 'severity', value: 'med' })
    expect(await shown()).toEqual(['med'])
    await ui.select({ key: 'severity', value: 'low' })
    expect(await shown()).toEqual(['outside', 'huge'])
    // The bar, the legend, and Fix all count every finding, whatever is shown.
    expect((await legend(ui))?.text).toBe(SEVERITY_LEGEND)
    expect((await ui.find({ type: 'Button', key: 'fixHigh' }))?.props.label).toBe('Fix all CRIT and HIGH (2)')
    await ui.select({ key: 'severity', value: 'all' })
    expect(await shown()).toEqual(['crit', 'high', 'med', 'outside', 'huge'])

    await ui.select({ key: 'severity', value: 'med' })
    await $.command.run(commandRun('laa-findings'))
    expect(await shown()).toEqual(['crit', 'high', 'med', 'outside', 'huge'])
    expect((await ui.find({ key: 'severity' }))?.props.value).toBe('all')
    await ui.unmount()
  })

  test('Fix all takes every CRIT and HIGH finding while the filter hides them', async ($, on) => {
    const { filled } = await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    await ui.select({ key: 'severity', value: 'low' })
    expect(await ui.find({ type: 'Button', key: 'fix0' })).toBeUndefined()
    await ui.press({ key: 'fixHigh' })
    expect(filled).toEqual([
      `Fix these findings from the last review, then mark each one fixed in ${REVIEW_FILE}: ` +
        'CRIT internal/billing/invoice.go:3 nil address dereference on legacy rows → guard with addr == nil; ' +
        'HIGH internal/billing/invoice.go:8 query in a loop over line items → preload with one join',
    ])
    await ui.unmount()
  })

  test('draws no filter on mobile, which shows every finding whatever the filter is', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const terminal = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    await terminal.select({ key: 'severity', value: 'med' })
    await terminal.unmount()

    const mobile = await $.ui.mount({ ...PANE.findings, surface: 'mobile' })
    expect(all((await mobile.drawn()) as Drawn, 'Select')).toEqual([])
    for (const title of Object.values(TITLES)) expect(await mobile.find({ type: 'Text', text: title }), title).toBeDefined()
    await mobile.unmount()

    for (const surface of ['desktop', 'vscode'] as const) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      expect((await ui.find({ type: 'Select', key: 'severity' }))?.props.value, surface).toBe('med')
      expect(await ui.find({ type: 'Text', text: TITLES.crit }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('offers no filter for three findings or fewer, and stops filtering once that few are left', async ($, on) => {
    const { seen } = await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    await ui.select({ key: 'severity', value: 'low' })
    // Two findings are fixed while the filter shows only LOW: three are left, so the filter goes and all three show.
    seen.setFile(REVIEW_FILE, REVIEW.replace('- status: open', '- status: fixed (def5678)').replace('- status: open', '- status: fixed (def5678)'))
    await $.turn.complete(turnEnd('Fixed two.'))
    expect(await ui.find({ type: 'Select' })).toBeUndefined()
    for (const title of [TITLES.med, TITLES.outside, TITLES.huge]) expect(await ui.find({ type: 'Text', text: title }), title).toBeDefined()
    expect((await legend(ui))?.text).toBe('█ CRIT 0 · ▓ HIGH 0 · ▒ MED 1 · ░ LOW 2')
    expect(await ui.find({ type: 'Button', key: 'fixHigh' })).toBeUndefined()
    await ui.unmount()
  })

  test('Fix, Dismiss, and Fix all do what they did in 0.3.0', async ($, on) => {
    const { seen, filled } = await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    expect((await ui.find({ type: 'Button', key: 'fixHigh' }))?.props).toMatchObject({ label: 'Fix all CRIT and HIGH (2)', variant: 'primary', hotkey: 'f' })

    await ui.press({ key: 'fix0' })
    expect(filled[0]).toBe(
      `Fix this finding from the last review, then mark it fixed in ${REVIEW_FILE}: ` +
        'CRIT internal/billing/invoice.go:3 nil address dereference on legacy rows → guard with addr == nil',
    )
    expect(seen.toasts).toContain('laa · the fix is in the prompt. Press Enter to run it.')

    await ui.press({ key: 'dismiss1' })
    expect(seen.file(REVIEW_FILE)).toContain('- status: dismissed (in the laa-findings pane)')
    expect(seen.toasts).toContain('laa · dismissed HIGH internal/billing/invoice.go:8')
    expect(await ui.find({ type: 'Text', text: TITLES.high })).toBeUndefined()
    expect((await ui.find({ type: 'Button', key: 'fixHigh' }))?.props.label).toBe('Fix all CRIT and HIGH (1)')

    await ui.press({ key: 'fixHigh' })
    expect(filled[1]).toBe(
      `Fix this finding from the last review, then mark it fixed in ${REVIEW_FILE}: ` +
        'CRIT internal/billing/invoice.go:3 nil address dereference on legacy rows → guard with addr == nil',
    )
    await ui.unmount()
  })

  test('names a location it cannot link to in dim text, and draws a review with nothing open as 0.3.0 did', async ($, on) => {
    // A path too long for a Link's address.
    const long = `internal/${'a'.repeat(2100)}.go:4`
    const { seen } = await world($, on, { files: { [REVIEW_FILE]: `## LOW · ${long} · generated name\n- status: open\n` } })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      const tree = (await ui.drawn()) as Drawn
      expect(all(tree, 'Link'), surface).toEqual([])
      expect(await ui.find({ type: 'Text', text: long }), surface).toMatchObject({ props: { dimColor: true } })
      await ui.unmount()
    }

    seen.setFile(REVIEW_FILE, '# Review\n')
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      expect(show((await ui.drawn()) as Drawn), surface).toBe(
        ['<Box flexDirection="column">', '  <Text dimColor>"C:/r"</Text>', '  <Text>"No open findings. Nothing to fix."</Text>', '</Box>'].join('\n'),
      )
      await ui.unmount()
    }
  })

  test('two turn ends over an unchanged review read no file again and write the findings no more', async ($, on) => {
    const { seen, writes } = await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    const source = () => seen.reads.filter(p => p.startsWith('internal/')).length
    const before = { stats: seen.stats.length, reads: source(), findings: writes.findings }
    expect(before).toMatchObject({ reads: 1, findings: 1 })
    await $.turn.complete(turnEnd('Looked at the review.'))
    await $.turn.complete(turnEnd('Looked at the review.'))
    expect({ stats: seen.stats.length, reads: source(), findings: writes.findings }).toEqual(before)
    expect(all((await ui.drawn()) as Drawn, 'Code')).toHaveLength(2)
    await ui.unmount()
  })
})

describe('learnings pane · visuals: full', () => {
  test('draws the scope bar on the terminal, its legend everywhere, and every open learning', async ($, on) => {
    await world($, on, { learnings: LEARNINGS })
    await $.command.run(commandRun('laa-learnings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.learnings, surface })
      const tree = (await ui.drawn()) as Drawn
      expect(show(tree).split('\n')[1], surface).toBe(`  <Text dimColor>${JSON.stringify(ROOT)}</Text>`)
      expect((await legend(ui))?.text, surface).toBe(SCOPE_LEGEND)
      const rasters = all(tree, 'Raster')
      if (surface !== 'terminal') {
        expect(rasters, surface).toEqual([])
      } else {
        expect(rasters.map(r => [r.props?.key, r.props?.columns, r.props?.rows])).toEqual([['scope-bar', 40, 1]])
        const cells = decodeCells(String(rasters[0]?.props?.cells))
        expect(cells.text).toBe(SCOPE_BAR)
        expect(cells.fg).toEqual(Array(40).fill(DEFAULT_FG))
      }
      // Each entry as 0.3.0 drew it.
      expect(show(keyed(tree, 'entry0') ?? ''), surface).toBe(
        [
          '<Box flexDirection="column" key="entry0" marginTop=1>',
          '  <Text bold>"2026-01-10 · laa:fix · wrong test command"</Text>',
          '  <Text dimColor>"local" " · " "correction" " · " "CLAUDE.md"</Text>',
          '  <Text>"saw wrong test command"</Text>',
          '  <Text color="suggestion">"→ " "note wrong test command"</Text>',
          '  <Button key="reject0" label="Reject" />',
          '</Box>',
        ].join('\n'),
      )
      expect(all(tree, 'Button').map(b => b.props?.key), surface).toEqual(['reject0', 'reject1', 'reject3', 'reject4', 'reject5', 'evolve'])
      expect((await ui.find({ type: 'Button', key: 'evolve' }))?.props, surface).toMatchObject({ label: 'Evolve with /laa:evolve', variant: 'primary', hotkey: 'e' })
      expect(await ui.find({ type: 'Text', text: 'old rule' }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the filter hides and shows learnings by scope on every surface with a Select, and the command resets it', async ($, on) => {
    await world($, on, { learnings: LEARNINGS })
    await $.command.run(commandRun('laa-learnings'))
    const keysOf = async (ui: { drawn: () => Promise<unknown> }) =>
      all((await ui.drawn()) as Drawn, 'Button').map(b => String(b.props?.key))
    for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
      const ui = await $.ui.mount({ ...PANE.learnings, surface })
      expect((await ui.find({ type: 'Select', key: 'scope' }))?.props, surface).toMatchObject({
        value: 'all',
        options: [{ value: 'all', label: 'all' }, { value: 'local', label: 'local' }, { value: 'generic', label: 'generic' }],
      })
      await ui.select({ key: 'scope', value: 'generic' })
      expect(await keysOf(ui), surface).toEqual(['reject3', 'reject5', 'evolve'])
      await ui.select({ key: 'scope', value: 'local' })
      expect(await keysOf(ui), surface).toEqual(['reject0', 'reject1', 'reject4', 'evolve'])
      expect((await legend(ui))?.text, surface).toBe(SCOPE_LEGEND)

      // Mobile has no Select: it shows every learning, whatever the filter is.
      const mobile = await $.ui.mount({ ...PANE.learnings, surface: 'mobile' })
      expect(all((await mobile.drawn()) as Drawn, 'Select'), surface).toEqual([])
      expect(await keysOf(mobile), surface).toEqual(['reject0', 'reject1', 'reject3', 'reject4', 'reject5', 'evolve'])
      await mobile.unmount()

      await $.command.run(commandRun('laa-learnings'))
      expect(await keysOf(ui), surface).toEqual(['reject0', 'reject1', 'reject3', 'reject4', 'reject5', 'evolve'])
      expect((await ui.find({ key: 'scope' }))?.props.value, surface).toBe('all')
      await ui.unmount()
    }
  })

  test('Reject and Evolve do what they did in 0.3.0', async ($, on) => {
    const { seen, filled } = await world($, on, { learnings: LEARNINGS })
    await $.command.run(commandRun('laa-learnings'))
    const ui = await $.ui.mount({ ...PANE.learnings, surface: 'terminal' })
    await ui.press({ key: 'reject3' })
    expect(seen.learnings).toContain('- status: rejected (dismissed in the laa-learnings pane)')
    expect(seen.toasts).toContain('laa · rejected "2026-01-10 · laa:fix · missed migration"')
    expect(await ui.find({ type: 'Text', text: 'missed migration' })).toBeUndefined()
    expect((await legend(ui))?.text).toBe('▓ local 3 · ░ generic 1')

    await ui.press({ key: 'evolve' })
    expect(filled).toEqual(['/laa:evolve '])
    expect(seen.toasts).toContain('laa · /laa:evolve is in the prompt. Press Enter to run it.')
    await ui.unmount()
  })

  test('draws no learnings as 0.3.0 did', async ($, on) => {
    await world($, on)
    await $.command.run(commandRun('laa-learnings'))
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.learnings, surface })
      expect(show((await ui.drawn()) as Drawn), surface).toBe(
        ['<Box flexDirection="column">', '  <Text dimColor>"C:/r"</Text>', '  <Text>"No open learnings. Nothing to evolve."</Text>', '</Box>'].join('\n'),
      )
      await ui.unmount()
    }
  })
})

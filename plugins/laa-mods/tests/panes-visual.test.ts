import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { decodeCells, DEFAULT_FG } from '../hooks/draw'
import { isInGit } from '../hooks/git'
import { snippetOf, snippetsOf } from '../hooks/panes'
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

      // Only the terminal opens a `file:` link; what the other surfaces draw is pinned in the next test.
      if (surface === 'terminal') {
        expect(all(tree, 'Link').map(l => l.props)).toEqual([
          { href: 'file:///C:/r/internal/billing/invoice.go', label: 'internal/billing/invoice.go:3' },
          { href: 'file:///C:/r/internal/billing/invoice.go', label: 'internal/billing/invoice.go:8' },
          { href: 'file:///C:/r/internal/billing/gone.go', label: 'internal/billing/gone.go:3' },
          { href: 'file:///C:/other/secret.go', label: '../other/secret.go:1' },
          { href: 'file:///C:/r/internal/billing/huge.go', label: 'internal/billing/huge.go:1' },
        ])
      }
      expect(await ui.find({ type: 'Text', text: '→ guard with addr == nil' }), surface).toMatchObject({ props: { color: 'suggestion' } })
      expect(await ui.find({ type: 'Text', text: 'unescaped customer name' }), surface).toBeUndefined()
      await ui.unmount()
    }
  })

  test('links each location on the terminal only: the other surfaces draw it dim, as 0.3.0 did', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES })
    await $.command.run(commandRun('laa-findings'))
    const locations = [
      'internal/billing/invoice.go:3',
      'internal/billing/invoice.go:8',
      'internal/billing/gone.go:3',
      '../other/secret.go:1',
      'internal/billing/huge.go:1',
    ]
    for (const surface of ALL_SURFACES) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      const tree = (await ui.drawn()) as Drawn
      // The line under each finding's key: its tag, then its location.
      const drawn = locations.map((_, i) => {
        const line = keyed(tree, `finding${i}`)?.children?.[0] as Exclude<Drawn, string> | undefined
        return line?.children?.[1] as Exclude<Drawn, string> | undefined
      })
      if (surface === 'terminal') {
        expect(drawn.map(d => [d?.type, d?.props?.label]), surface).toEqual(locations.map(l => ['Link', l]))
        expect(drawn.every(d => String(d?.props?.href).startsWith('file:///C:/')), surface).toBe(true)
      } else {
        // No `file:` address reaches a surface that opens none: no Link, and no plain, undimmed text in its place.
        expect(all(tree, 'Link'), surface).toEqual([])
        expect(show(tree), surface).not.toContain('file:')
        expect(drawn.map(d => [d?.type, d?.props, d?.children]), surface).toEqual(locations.map(l => ['Text', { dimColor: true }, [l]]))
      }
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
    const before = { reads: source(), findings: writes.findings }
    expect(before).toMatchObject({ reads: 1, findings: 1 })
    await $.turn.complete(turnEnd('Looked at the review.'))
    await $.turn.complete(turnEnd('Looked at the review.'))
    // Each turn's end asks the cited files their age (an edit would show there) and reads none.
    expect({ reads: source(), findings: writes.findings }).toEqual(before)
    expect(all((await ui.drawn()) as Drawn, 'Code')).toHaveLength(2)
    await ui.unmount()
  })
})

// Invented files a snippet must be made safe from: one with terminal control characters and a line far too
// long, and one that is binary.
const UNSAFE = ['plain', 'esc \u001b[31m bel \u0007 nel \u0085 tab \t end', `long ${'x'.repeat(300)}`, 'last'].join('\n')
const UNSAFE_REVIEW = [
  '## HIGH · internal/billing/unsafe.go:2 · escape sequences in a fixture',
  '- status: open',
  '## LOW · internal/billing/blob.go:1 · binary checked in',
  '- status: open',
  '',
].join('\n')

describe('finding snippets · safe to draw', () => {
  test('control characters become ?, a long line is cut, and a binary file gives no code', async ($, on) => {
    await world($, on, {
      files: { [REVIEW_FILE]: UNSAFE_REVIEW, 'internal/billing/unsafe.go': UNSAFE, 'internal/billing/blob.go': 'head\u0000tail\nmore' },
    })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      // A refused tree rejects here: the pane draws.
      const tree = (await ui.drawn()) as Drawn
      const code = all(keyed(tree, 'finding0') ?? '', 'Code')
      expect(code.map(c => c.props), surface).toEqual([
        {
          source: ['plain', 'esc ?[31m bel ? nel ? tab \t end', `long ${'x'.repeat(195)}`, 'last'].join('\n'),
          startLine: 1,
          path: 'internal/billing/unsafe.go',
          wrap: 'truncate-end',
        },
      ])
      const source = String(code[0]?.props?.source)
      expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(source), surface).toBe(false)
      expect(Math.max(...source.split('\n').map(l => l.length)), surface).toBe(200)
      expect(all(keyed(tree, 'finding1') ?? '', 'Code'), surface).toEqual([])
      expect(await ui.find({ type: 'Text', text: 'binary checked in' }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  test("control characters in a finding's own text are left out, and its buttons still act on it as the file has it", async ($, on) => {
    const title = 'beep \u001b[31mred\u001b[0m \u0007title'
    const review = [`## HIGH · internal/billing/in\u0007voice.go:3 · ${title}`, '- fix: strip \u001b[1mit\u0007', '- status: open', ''].join('\n')
    const { filled } = await world($, on, { files: { [REVIEW_FILE]: review } })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      // A refused tree rejects here: the pane draws.
      const tree = (await ui.drawn()) as Drawn
      expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(show(tree).replace(/\\u[0-9a-f]{4}/g, '\u0007')), surface).toBe(false)
      expect(await ui.find({ type: 'Text', text: 'beep red title' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '→ strip it' }), surface).toBeDefined()
      const location = (keyed(tree, 'finding0')?.children?.[0] as Exclude<Drawn, string>).children?.[1] as Exclude<Drawn, string>
      expect(surface === 'terminal' ? location.props?.label : location.children, surface).toEqual(
        surface === 'terminal' ? 'internal/billing/invoice.go:3' : ['internal/billing/invoice.go:3'],
      )
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    await ui.press({ key: 'fix0' })
    expect(filled).toEqual([
      `Fix this finding from the last review, then mark it fixed in ${REVIEW_FILE}: HIGH internal/billing/in\u0007voice.go:3 ${title} → strip \u001b[1mit\u0007`,
    ])
    await ui.unmount()
  })

  test("control characters in a learning's own text are left out, and Reject still finds the entry", async ($, on) => {
    const entry = [
      '## beep \u001b[31mred\u001b[0m \u0007learning',
      '- scope: local\u0007',
      '- kind: correc\u001b[1mtion',
      '- target: CLAUDE\u0007.md',
      '- signal: saw \u0007it',
      '- proposal: note \u001b[4mit',
      '- status: open',
      '',
    ].join('\n')
    const { seen } = await world($, on, { learnings: entry })
    await $.command.run(commandRun('laa-learnings'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE.learnings, surface })
      const tree = (await ui.drawn()) as Drawn
      expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(show(tree).replace(/\\u[0-9a-f]{4}/g, '\u0007')), surface).toBe(false)
      expect(await ui.find({ type: 'Text', text: 'beep red learning' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'local · correction · CLAUDE.md' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'saw it' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '→ note it' }), surface).toBeDefined()
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE.learnings, surface: 'terminal' })
    await ui.press({ key: 'reject0' })
    expect(seen.learnings).toContain('- status: rejected (dismissed in the laa-learnings pane)')
    await ui.unmount()
  })

  test('a link that lands outside the repo gives no code, and one that lands inside it does', async ($, on) => {
    const review = [
      '## HIGH · internal/billing/vendor.go:1 · a link out of the repo',
      '- status: open',
      '## LOW · internal/billing/alias.go:3 · a link to a file of the repo',
      '- status: open',
      '',
    ].join('\n')
    const { seen } = await world($, on, {
      files: { [REVIEW_FILE]: review, 'internal/billing/invoice.go': SOURCE },
      links: {
        'internal/billing/vendor.go': { to: 'C:/other/secret.go', text: 'token = "invented"' },
        'internal/billing/alias.go': { to: `${ROOT}/internal/billing/invoice.go`, text: SOURCE },
      },
    })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    const tree = (await ui.drawn()) as Drawn
    expect(all(keyed(tree, 'finding0') ?? '', 'Code')).toEqual([])
    expect(show(tree)).not.toContain('invented')
    // What is read is where the path lands, and the link out of the repo is never read.
    expect(seen.reads.filter(p => !p.startsWith('.claude/'))).toEqual(['internal/billing/invoice.go'])
    expect(all(keyed(tree, 'finding1') ?? '', 'Code').map(c => c.props)).toEqual([
      { source: 'line 1\nline 2\nline 3\nline 4\nline 5', startLine: 1, path: 'internal/billing/alias.go', wrap: 'truncate-end' },
    ])
    await ui.unmount()
  })

  test('a repo whose root is itself reached through a link still shows its code', async ($, on) => {
    await world($, on, { files: FILES, sizes: SIZES, realRoot: 'C:/store/r' })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    expect(all((await ui.drawn()) as Drawn, 'Code')).toHaveLength(2)
    await ui.unmount()
  })

  test("git's own files give no code, however .git is spelled", async ($, on) => {
    const review = ['## HIGH · .GIT/config:1 · remote url', '- status: open', '## LOW · .git/config:1 · remote url', '- status: open', ''].join('\n')
    const { seen } = await world($, on, { files: { [REVIEW_FILE]: review, '.GIT/config': '[remote "origin"]', '.git/config': '[remote "origin"]' } })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    expect(all((await ui.drawn()) as Drawn, 'Code')).toEqual([])
    expect(seen.reads.filter(p => p.toLowerCase().startsWith('.git'))).toEqual([])
    await ui.unmount()
    // On a root with no drive letter, where the path's spelling is compared as written.
    expect(isInGit('/w/r/.GIT/config', '/w/r')).toBe(true)
    expect(isInGit('/w/r/vendor/lib/.git/HEAD', '/w/r')).toBe(true)
    expect(isInGit('/w/r/.github/workflows/ci.yml', '/w/r')).toBe(false)
    expect(isInGit('/w/r/.gitignore', '/w/r/')).toBe(false)
  })

  test('the code names its file by the path inside the repo, never by the location as written', async ($, on) => {
    const review = ['## HIGH · ./internal/../internal/billing/invoice.go:3 · roundabout', '- status: open', ''].join('\n')
    await world($, on, { files: { [REVIEW_FILE]: review, 'internal/billing/invoice.go': SOURCE } })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE.findings, surface: 'terminal' })
    expect(all((await ui.drawn()) as Drawn, 'Code').map(c => c.props?.path)).toEqual(['internal/billing/invoice.go'])
    await ui.unmount()
  })

  test('a location some ten thousand characters long still opens the pane, with no code for it', async ($, on) => {
    const long = `${'./'.repeat(5000)}README.md:1`
    expect(long.length).toBeGreaterThan(10000)
    const review = [`## LOW · ${long} · a long way round`, '- status: open', '## HIGH · internal/billing/invoice.go:3 · near', '- status: open', ''].join('\n')
    await world($, on, { files: { [REVIEW_FILE]: review, 'README.md': '# Invented', 'internal/billing/invoice.go': SOURCE } })
    await $.command.run(commandRun('laa-findings'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE.findings, surface })
      // A refused tree rejects here.
      const tree = (await ui.drawn()) as Drawn
      expect(await ui.find({ type: 'Text', text: 'a long way round' }), surface).toBeDefined()
      expect(all(keyed(tree, 'finding0') ?? '', 'Code'), surface).toEqual([])
      expect(all(keyed(tree, 'finding1') ?? '', 'Code'), surface).toHaveLength(1)
      await ui.unmount()
    }
  })

  test('the line break that ends a file starts no line, and a byte order mark is left out', () => {
    expect(snippetOf('one\ntwo\nthree\n', 3)).toEqual({ source: 'one\ntwo\nthree', startLine: 1 })
    expect(snippetOf('one\ntwo\nthree\n', 4)).toBeNull()
    expect(snippetOf('one\r\ntwo\r\n', 2)).toEqual({ source: 'one\ntwo', startLine: 1 })
    // Only the one break that ends the file: an empty line before it is a line.
    expect(snippetOf('one\n\n', 2)).toEqual({ source: 'one\n', startLine: 1 })
    expect(snippetOf('', 1)).toEqual({ source: '', startLine: 1 })
    expect(snippetOf('\ufeffpackage billing\nfunc total() {}', 1)).toEqual({ source: 'package billing\nfunc total() {}', startLine: 1 })
    expect(snippetOf('head\u0000tail', 1)).toBeNull()
  })

  test('several lines of one file are each cut as one line alone is', () => {
    const text = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join('\r\n')
    const cuts = snippetsOf(text, [2, 8, 12, 2.5])
    expect([...cuts.keys()]).toEqual([2, 8, 12, 2.5])
    for (const line of [2, 8, 12, 2.5]) expect(cuts.get(line), `${line}`).toEqual(snippetOf(text, line))
    expect(cuts.get(8)).toEqual({ source: 'line 6\nline 7\nline 8\nline 9', startLine: 6 })
    // A binary file gives none, whichever line is asked for.
    expect([...snippetsOf('head\u0000tail\nmore', [1, 2]).values()]).toEqual([null, null])
    expect(snippetsOf(text, []).size).toBe(0)
  })
})

// Invented learnings whose scopes are not written as the format says: three that still name local or generic,
// and three that name neither.
const ODD_SCOPES = [
  '# Learnings',
  '',
  ...learning('capital letter', 'Local'),
  ...learning('with a note', 'generic (upstream)'),
  ...learning('both named', 'local | generic'),
  ...learning('team wide', 'team'),
  ...learning('nothing given', ''),
  ...learning('a number', '2'),
].join('\n')

describe('learnings pane · visuals: full', () => {
  test('counts a scope by its leading word, and anything else as other, with its own shade and filter', async ($, on) => {
    await world($, on, { learnings: ODD_SCOPES })
    await $.command.run(commandRun('laa-learnings'))
    const ui = await $.ui.mount({ ...PANE.learnings, surface: 'terminal' })
    const keys = async () => all((await ui.drawn()) as Drawn, 'Button').map(b => String(b.props?.key))
    expect((await legend(ui))?.text).toBe('▓ local 2 · ▒ other 3 · ░ generic 1')
    const bar = all((await ui.drawn()) as Drawn, 'Raster')[0]
    expect(decodeCells(String(bar?.props?.cells)).text).toBe('▓'.repeat(13) + '▒'.repeat(21) + '░'.repeat(6))
    expect((await ui.find({ type: 'Select', key: 'scope' }))?.props.options).toEqual([
      { value: 'all', label: 'all' },
      { value: 'local', label: 'local' },
      { value: 'other', label: 'other' },
      { value: 'generic', label: 'generic' },
    ])
    await ui.select({ key: 'scope', value: 'local' })
    expect(await keys()).toEqual(['reject0', 'reject2', 'evolve'])
    await ui.select({ key: 'scope', value: 'generic' })
    expect(await keys()).toEqual(['reject1', 'evolve'])
    await ui.select({ key: 'scope', value: 'other' })
    expect(await keys()).toEqual(['reject3', 'reject4', 'reject5', 'evolve'])
    // The scope is still drawn as the file has it.
    expect(await ui.find({ type: 'Text', text: 'team · correction · CLAUDE.md' })).toBeDefined()
    await ui.unmount()
  })

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

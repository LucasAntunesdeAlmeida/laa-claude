import { describe, expect, test } from 'claude-code/testing'

import { countOpenHigh, parseFindings, setFindingStatus } from '../hooks/git'
import { commandRun, fakeRepo, ROOT } from './fake'

// An invented saved review in the /laa:review format: two open, one fixed.
const REVIEW = [
  '# Review · fix/invoice-500 against main',
  '',
  '## HIGH · internal/billing/invoice.go:88 · nil address dereference on legacy rows',
  '- fix: guard with addr == nil',
  '- status: open',
  '',
  '## MED · internal/billing/invoice.go:120 · query in a loop over line items',
  '- fix: preload with one join',
  '- status: open',
  '',
  '## HIGH · internal/billing/pdf.go:12 · unescaped customer name',
  '- fix: escape it',
  '- status: fixed (abc1234)',
  '',
].join('\n')

const PANE = {
  plugin: 'laa-mods',
  component: 'Pane' as const,
  requestId: 'laa-findings',
  props: { title: 'laa · last review', bodyColumns: 80, isFocused: false, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

describe('saved review findings', () => {
  test('lists the open findings, keeping their place in the file', () => {
    const open = parseFindings(REVIEW)
    expect(open.map(f => [f.index, f.tag, f.location])).toEqual([
      [0, 'HIGH', 'internal/billing/invoice.go:88'],
      [1, 'MED', 'internal/billing/invoice.go:120'],
    ])
    expect(open[0]?.fix).toBe('guard with addr == nil')
    expect(countOpenHigh(REVIEW)).toBe(1)
  })

  test('reads backticked tags and locations, and locations with spaces', () => {
    const text = '## `HIGH` · `docs/how to run.md:3` · wrong port\n- status: open\n## LOW · `a.go:1` · name\n- status: open\n'
    expect(parseFindings(text).map(f => [f.tag, f.location, f.title])).toEqual([
      ['HIGH', 'docs/how to run.md:3', 'wrong port'],
      ['LOW', 'a.go:1', 'name'],
    ])
  })

  test('sets exactly one finding, and refuses when the file moved on', () => {
    const next = setFindingStatus(REVIEW, 1, 'internal/billing/invoice.go:120', 'dismissed (x)')
    expect(next).toContain('- status: dismissed (x)')
    expect(parseFindings(next ?? '').map(f => f.index)).toEqual([0])
    expect(setFindingStatus(REVIEW, 1, 'internal/other.go:1', 'x')).toBeNull()
    expect(setFindingStatus(REVIEW, 2, 'internal/billing/pdf.go:12', 'x')).toBeNull()
  })
})

describe('findings pane', () => {
  test('says when there is no saved review', async ($, on) => {
    fakeRepo(on)
    const out = await $.command.run(commandRun('laa-findings'))
    expect(String(out.text)).toBe(`laa · no saved review in ${ROOT}. Run /laa:review first.`)
  })

  test('lists the open findings; Fix fills the prompt and Dismiss marks the file', async ($, on) => {
    const seen = fakeRepo(on, { files: { '.claude/laa/local/last-review.md': REVIEW } })
    const filled: string[] = []
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })
    const out = await $.command.run(commandRun('laa-findings'))
    expect(String(out.text)).toBe(`laa · 2 open findings in ${ROOT}.`)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: 'nil address dereference on legacy rows' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'unescaped customer name' })).toBeUndefined()
      expect(await ui.find({ type: 'Button', key: 'fixHigh' })).toBeDefined()
      await ui.unmount()
    }

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'fix0' })
    expect(filled[0]).toBe(
      'Fix this finding from the last review, then mark it fixed in .claude/laa/local/last-review.md: ' +
        'HIGH internal/billing/invoice.go:88 nil address dereference on legacy rows → guard with addr == nil',
    )
    await ui.press({ key: 'dismiss1' })
    expect(seen.file('.claude/laa/local/last-review.md')).toContain('- status: dismissed (in the laa-findings pane)')
    expect(seen.toasts).toContain('laa · dismissed MED internal/billing/invoice.go:120')
    expect(await ui.find({ type: 'Text', text: 'query in a loop over line items' })).toBeUndefined()
    await ui.unmount()
  })

  test("won't fill a fix for a finding fixed since the pane loaded, and reloads", async ($, on) => {
    const seen = fakeRepo(on, { files: { '.claude/laa/local/last-review.md': REVIEW } })
    const filled: string[] = []
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })
    await $.command.run(commandRun('laa-findings'))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    seen.setFile('.claude/laa/local/last-review.md', REVIEW.replace('- status: open', '- status: fixed (def5678)'))
    await ui.press({ key: 'fix0' })
    expect(filled).toEqual([])
    expect(seen.toasts).toContain('laa · last-review.md changed since the pane loaded it; reloaded.')
    expect(await ui.find({ type: 'Text', text: 'nil address dereference on legacy rows' })).toBeUndefined()
    await ui.unmount()
  })
})

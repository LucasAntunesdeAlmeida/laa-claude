import { describe, expect, test } from 'claude-code/testing'

import { parseLearnings, rejectLearning } from '../hooks/git'
import { bash, denied, edit, fakeRepo, ROOT, turnEnd } from './fake'

// Invented entries in the laa:retro format: two open, one already applied.
const FILE = [
  '# Learnings',
  '',
  '## 2026-01-10 · laa:fix · wrong test command',
  '- scope: local',
  '- kind: wrong-assumption',
  '- target: project-map.md#testing',
  '- signal: tests need `make test-int`',
  '- proposal: fix the testing section',
  '- status: open',
  '',
  '## 2026-01-11 · laa:review · old rule',
  '- scope: local',
  '- kind: correction',
  '- target: CLAUDE.md',
  '- signal: already handled',
  '- proposal: none',
  '- status: applied (CLAUDE.md)',
  '',
  '## 2026-01-12 · laa:feature · missed migration',
  '- scope: generic',
  '- kind: missed-step',
  '- target: laa:feature step 6',
  '- signal: new column shipped without a migration',
  '- proposal: add a migration check',
  '- status: open',
  '',
].join('\n')

const PANE = {
  plugin: 'laa-mods',
  component: 'Pane' as const,
  requestId: 'laa-learnings',
  props: { title: 'laa · open learnings', bodyColumns: 80, isFocused: false, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

const learningsRun = {
  command: 'laa-learnings',
  args: '',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
}

describe('learnings parsing', () => {
  test('lists only open entries, keeping their place in the file', () => {
    const open = parseLearnings(FILE)
    expect(open.map(e => [e.index, e.title])).toEqual([
      [0, '2026-01-10 · laa:fix · wrong test command'],
      [2, '2026-01-12 · laa:feature · missed migration'],
    ])
    expect(open[1]?.kind).toBe('missed-step')
    expect(open[1]?.proposal).toBe('add a migration check')
  })

  test('marks exactly one entry rejected, and refuses when the file moved on', () => {
    const next = rejectLearning(FILE, 2, '2026-01-12 · laa:feature · missed migration', 'not now')
    expect(next).toContain('- status: rejected (not now)')
    expect(parseLearnings(next ?? '').map(e => e.index)).toEqual([0])
    expect(rejectLearning(FILE, 2, 'some other title', 'x')).toBeNull()
    expect(rejectLearning(FILE, 1, '2026-01-11 · laa:review · old rule', 'x')).toBeNull()
  })
})

describe('learnings pane', () => {
  test('lists the open learnings, and Reject marks one in learnings.md', async ($, on) => {
    const seen = fakeRepo(on, { learnings: FILE })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const out = await $.command.run(learningsRun)
    expect(String(out.text)).toContain(`2 open learnings in ${ROOT}`)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: 'wrong test command' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'old rule' })).toBeUndefined()
      expect(await ui.find({ type: 'Button', key: 'evolve' })).toBeDefined()
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'reject2' })
    expect(seen.learnings).toContain('- status: rejected (dismissed in the laa-learnings pane)')
    expect(seen.toasts.some(t => t.includes('rejected "2026-01-12'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: 'missed migration' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('guard toast', () => {
  test('shows a toast when it blocks an edit or a commit', async ($, on) => {
    const seen = fakeRepo(on)
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(true)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(true)
    expect(seen.toasts).toEqual([
      'laa · blocked editing a.go on main. Create a task branch first.',
      'laa · blocked a commit on main. Create a task branch first.',
    ])
  })
})

describe('learning logged toast', () => {
  test('says once, at the end of the turn, how many learnings it added', async ($, on) => {
    const seen = fakeRepo(on, { branch: 'feat/export', learnings: FILE })
    on('turn.complete', ($, e) => ({ text: e.answer }))
    const path = '.claude/laa/learnings.md'
    await $.tool.call(edit(`${ROOT}/${path}`))
    seen.setFile(path, `${FILE}
## 2026-01-13 · laa:fix · one
- status: open
`)
    await $.tool.call(edit(`${ROOT}/${path}`))
    seen.setFile(path, `${seen.file(path)}
## 2026-01-13 · laa:fix · two
- status: open
`)
    expect(seen.toasts).toEqual([])
    await $.turn.complete(turnEnd('Logged two learnings.'))
    expect(seen.toasts).toEqual(['laa · 2 learnings logged · 4 open · /laa-learnings'])
    await $.turn.complete(turnEnd('Nothing else.'))
    expect(seen.toasts).toHaveLength(1)
  })
})

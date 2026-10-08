import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bash, fakeRepo } from './fake'
import type { Fake } from './fake'

const BAND = {
  plugin: 'laa-mods',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
}

const SURFACES = ['terminal', 'desktop'] as const

const open = (n: number) => Array.from({ length: n }, (_, i) => `## entry ${i}\n- status: open`).join('\n')

// A repo in the given state, the engine's own (empty) band beneath the plugin, and one git
// command so the plugin reads the repo, as it does after every git command in a session.
async function setUp($: { tool: { call: (i: ReturnType<typeof bash>) => Promise<unknown> } }, on: On, f: Fake) {
  const seen = fakeRepo(on, f)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }))
  await $.tool.call(bash('git status'))
  return seen
}

describe('status band', () => {
  test('stays out of repos laa has not adopted', async ($, on) => {
    await setUp($, on, { isAdopted: false })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: /laa/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('shows the branch, and only the nudges that apply, quietly', async ($, on) => {
    await setUp($, on, { branch: 'feat/export', learnings: open(1), mapAge: 3 })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'feat/export' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1 open learning' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /evolve|project map|blocked/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('marks a blocked default branch, many open learnings, and a stale project map', async ($, on) => {
    await setUp($, on, { branch: 'main', learnings: open(4), mapAge: 75 })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: '✗ main · edits blocked' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '4 open learnings' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: ' → /laa:evolve' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'project map 75 commits old' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('points to /laa:adopt when the project map is missing, until the person mutes it', async ($, on) => {
    const seen = await setUp($, on, { branch: 'feat/export' })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'no project map' })).toBeDefined()
    await ui.press({ key: 'muteMap' })
    expect(await ui.find({ type: 'Text', text: 'no project map' })).toBeUndefined()
    expect(seen.toasts.some(t => t.startsWith('laa · project map nudge muted'))).toBe(true)
    await ui.unmount()
  })

  test('brings a muted map back once it is 100 commits stale', async ($, on) => {
    await setUp($, on, { branch: 'feat/export', mapAge: 120, store: { 'mutedMap:c:/r': true } })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'project map 120 commits old' })).toBeDefined()
    await ui.unmount()
  })

  test('shows a paused pipeline from the branch journal, and open high findings', async ($, on) => {
    await setUp($, on, {
      branch: 'feat/csv-export',
      mapAge: 1,
      files: {
        '.claude/laa/local/runs/feat-csv-export.md':
          '# laa:feature · feat/csv-export\n- status: waiting\n- step: 5/8 · Plan slices\n- gate: ★ Approve the plan?\n',
        '.claude/laa/local/last-review.md':
          '# Review\n## HIGH · a.go:1 · one\n- status: open\n## MED · a.go:2 · two\n- status: open\n## HIGH · a.go:3 · three\n- status: fixed (abc1234)\n',
      },
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: '○ paused laa:feature ▸ 5/8 Plan slices' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' → /laa:resume' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1 high finding open' })).toBeDefined()
    await ui.unmount()
  })

  test('hides a journal that finished', async ($, on) => {
    await setUp($, on, {
      branch: 'feat/csv-export',
      mapAge: 1,
      files: { '.claude/laa/local/runs/feat-csv-export.md': '# laa:feature · feat/csv-export\n- status: done\n- step: 8/8 · Close the loop\n' },
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /paused/ })).toBeUndefined()
    await ui.unmount()
  })
})

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
  fakeRepo(on, f)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }))
  await $.tool.call(bash('git status'))
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

  test('shows the branch, and only the nudges that apply', async ($, on) => {
    await setUp($, on, { branch: 'feat/export', learnings: open(1), mapAge: 3 })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'feat/export' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1 open learning' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /evolve/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /project map/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('flags the default branch, many open learnings, and a stale project map', async ($, on) => {
    await setUp($, on, { branch: 'main', learnings: open(4), mapAge: 75 })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'main (default branch, edits blocked)' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '4 open learnings · /laa:evolve' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'project map 75 commits old · /laa:adopt' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('points to /laa:adopt when the project map is missing', async ($, on) => {
    await setUp($, on, {})
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'no project map · /laa:adopt' })).toBeDefined()
    await ui.unmount()
  })
})

import { describe, expect, test } from 'claude-code/testing'

import { suggestionFor } from '../hooks/git'
import { commandRun, fakeRepo } from './fake'

const status = {
  branch: 'feat/export', isDefault: false, openLearnings: 0, mapAge: 3, isMapMuted: false, openHigh: 0, paused: null,
}

describe('/laa-help', () => {
  test('lists every command by job, the repo state, and what to run next', async ($, on) => {
    fakeRepo(on, { branch: 'feat/export', learnings: '## a\n- status: open\n## b\n- status: open\n## c\n- status: open\n', mapAge: 3 })
    const out = await $.command.run(commandRun('laa-help'))
    const text = String(out.text)
    expect(text).toContain('laa · feat/export · map 3 commits old · 3 open learnings · 0 high findings open')
    for (const command of ['/laa:explore', '/laa:fix', '/laa:feature', '/laa:migrate', '/laa:build', '/laa:review', '/laa:resume', '/laa:adopt', '/laa:forge', '/laa:retro', '/laa:evolve', '/laa-learnings', '/laa-findings']) {
      expect(text).toContain(command)
    }
    expect(text).toContain('**Engines**')
    expect(text).toContain('edits on the default branch are blocked')
    expect(text).toContain('**Suggested** `/laa:evolve`: 3 learnings are waiting')
  })

  test('draws the row with the same content in the terminal', async ($, on) => {
    fakeRepo(on, { branch: 'feat/export' })
    on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }))
    const out = await $.command.run(commandRun('laa-help'))
    const ui = await $.ui.mount({
      plugin: 'laa-mods',
      surface: 'terminal',
      component: 'CommandOutput',
      props: { command: 'laa-help', args: '', text: String(out.text), isErrored: false },
    })
    expect(await ui.find({ type: 'Text', text: 'Change' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\/laa:review \[ref\] \[--fix\]/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/laa:adopt' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '  there is no project map yet' })).toBeDefined()
    await ui.unmount()
  })

  test('suggests the most pressing thing first', () => {
    expect(suggestionFor(null, false)?.command).toBe('/laa:adopt')
    expect(suggestionFor(status, true)).toBeNull()
    const paused = { skill: 'feature', branch: 'feat/export', status: 'waiting', step: { n: 5, last: 8, title: 'Plan slices' }, gate: 'Approve the plan?' }
    expect(suggestionFor({ ...status, paused, openHigh: 2 }, true)).toEqual({
      command: '/laa:resume', why: 'laa:feature stopped at 5/8 Plan slices on feat/export',
    })
    expect(suggestionFor({ ...status, openHigh: 2, openLearnings: 5 }, true)?.command).toBe('/laa-findings')
    expect(suggestionFor({ ...status, mapAge: null, isMapMuted: true }, true)).toBeNull()
    expect(suggestionFor({ ...status, mapAge: 60 }, true)?.command).toBe('/laa:adopt')
  })
})

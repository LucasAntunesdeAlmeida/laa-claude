import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { gateOfQuestions, nextActionOf, parseJournal, progressOf } from '../hooks/git'
import { bash, fakeRepo, reply, turnEnd } from './fake'
import type { Fake } from './fake'

const BAND = {
  plugin: 'laa-mods',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
}
const FOOTER = { plugin: 'laa-mods', component: 'SessionMode' as const, props: { modes: ['auto-accept'] } }

// A repo on a task branch with a fresh map, the engine's own band and footer beneath the plugin,
// and the turn's end answered as the engine would.
// Returns the footer's mode labels as each draw handed them to the engine.
async function world($: { tool: { call: (i: ReturnType<typeof bash>) => Promise<unknown> } }, on: On, f: Fake = {}) {
  fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, ...f })
  const footers: string[][] = []
  on('ui.render', ($, e) => {
    if (e.component === 'SessionMode') footers.push([...e.props.modes])
    return $.ui.resolve(e).Box({ key: 'engine' })
  })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  await $.tool.call(bash('git status'))
  return footers
}

const skill = (name: string) => ({ skill: `laa:${name}`, text: `# /laa:${name}\n\nBug: something\n` })

describe('output contract lines', () => {
  test('reads the mode, the last step, the gate, and the closing report', () => {
    const p = progressOf('**laa:fix** · standard · workflow mode\n\n**▸ 2/7 · Reproduce** · test-engineer\n\n**▸ 3/7 · Investigate** · 5 angles')
    expect(p).toEqual({ skill: 'fix', step: { n: 3, last: 7, title: 'Investigate' }, gate: null, isClosing: false })
    expect(progressOf('**★ Approve the plan?** · 4 slices').gate).toBe('Approve the plan?')
    expect(progressOf('**✓ Fixed** · nil address\n\n**Next**\n- `/laa:retro`: capture').isClosing).toBe(true)
    expect(progressOf('No laa lines here.')).toEqual({ skill: null, step: null, gate: null, isClosing: false })
  })

  test('takes the first laa command of the Next list, and nothing before it', () => {
    expect(nextActionOf('Run `/laa:review` later.\n\n**Next**\n- say "open the PR"\n- `/laa:review --fix`: apply HIGH fixes')).toBe('/laa:review --fix')
    expect(nextActionOf('**Next**\n- say "open the PR"')).toBeNull()
    expect(nextActionOf('`/laa:retro` with no Next list')).toBeNull()
  })

  test('finds the ★ question, and reads a journal', () => {
    expect(gateOfQuestions([{ question: 'Which port?' }, { question: '★ Approve the recipe?' }])).toBe('Approve the recipe?')
    expect(gateOfQuestions([{ question: 'Which port?' }])).toBeNull()
    expect(parseJournal('# laa:migrate · migrate/slog\n- status: waiting\n- step: 2/7 · Pilot\n- gate: ★ Approve the recipe?\n')).toEqual({
      skill: 'migrate', branch: 'migrate/slog', status: 'waiting', step: { n: 2, last: 7, title: 'Pilot' }, gate: 'Approve the recipe?',
    })
    expect(parseJournal('# Notes\n')).toBeNull()
  })
})

describe('pipeline tracker', () => {
  test('follows a run through its steps in the band and the footer, and drops it at the closing report', async ($, on) => {
    const footers = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**laa:fix** · standard · workflow mode\n\n**▸ 3/7 · Investigate** · 5 angles'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ ...BAND, surface })
      expect(await band.find({ type: 'Text', text: '● laa:fix ▸ 3/7 Investigate' })).toBeDefined()
      await band.unmount()
      const footer = await $.ui.mount({ ...FOOTER, surface })
      expect(footers[footers.length - 1]).toEqual(['auto-accept', 'laa:fix 3/7'])
      await footer.unmount()
    }
    await $.turn.complete(turnEnd('**✓ Fixed** · nil address\n\n**Next**\n- say "open the PR"'))
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ type: 'Text', text: /laa:fix/ })).toBeUndefined()
    await band.unmount()
  })

  test('shows a gate waiting on the person, until the next step', async ($, on) => {
    const footers = await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices\n- **Approve**: …'))
    let band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ type: 'Text', text: '★ laa:feature · waiting on you: Approve the plan?' })).toBeDefined()
    await band.unmount()
    const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
    expect(footers[footers.length - 1]).toEqual(['auto-accept', 'laa:feature ★'])
    await footer.unmount()
    await $.session.append(reply('**▸ 6/8 · Implement** · 3 slices', 'row-2'))
    band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ type: 'Text', text: '● laa:feature ▸ 6/8 Implement' })).toBeDefined()
    await band.unmount()
  })

  test('shows an AskUserQuestion gate while it waits, and clears it once answered', async ($, on) => {
    // While the question waits, the band says so: the test mounts it from inside the tool call.
    const during: boolean[] = []
    await world($, on, {
      duringTool: async (_, e) => {
        if (e.tool !== 'AskUserQuestion') return
        const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
        during.push(Boolean(await band.find({ type: 'Text', text: '★ laa:migrate · waiting on you: Approve the recipe?' })))
        await band.unmount()
      },
    })
    await $.skill.prompt(skill('migrate'))
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: '★ Approve the recipe?', header: 'Recipe', multiSelect: false, options: [{ label: 'Approve', description: 'a' }, { label: 'Stop', description: 'b' }] }] })
    expect(during).toEqual([true])
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ type: 'Text', text: /waiting on you/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: '● laa:migrate' })).toBeDefined()
    await band.unmount()
  })

  for (const [door, origin] of [['delivery', { kind: 'engine' }], ['prompt', { kind: 'task-notification' }]] as const) {
    test(`names the engine a workflow runs until a task notification arrives (${door})`, async ($, on) => {
      await world($, on)
      await $.skill.prompt(skill('fix'))
      await $.tool.call({ tool: 'Workflow', name: 'laa:investigate', args: { bug: 'x' } })
      let band = await $.ui.mount({ ...BAND, surface: 'terminal' })
      expect(await band.find({ type: 'Text', text: ' · engine investigate' })).toBeDefined()
      await band.unmount()
      await $.session.append({
        message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: '<task-notification>task t1 completed</task-notification>' }] },
        door,
        origin: origin as never,
        uuid: 'row-3',
      })
      band = await $.ui.mount({ ...BAND, surface: 'terminal' })
      expect(await band.find({ type: 'Text', text: / · engine/ })).toBeUndefined()
      await band.unmount()
    })
  }

  test('keeps the run through a workflow report or a stray Next, and a step line brings a dropped pipeline back', async ($, on) => {
    const footers = await world($, on)
    const footer = async () => {
      const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
      await ui.unmount()
      return footers[footers.length - 1]
    }
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate**\n\n**✓ 2 of 3 root causes survived verification** · 5 angles\n- ✓ `a.go:1` nil'))
    await $.session.append(reply('Options below.\n\n**Next**\n- `/laa:explore`', 'row-2'))
    expect(await footer()).toEqual(['auto-accept', 'laa:fix 3/7'])
    await $.session.append(reply('**✓ Fixed** · nil\n\n**Next**\n- say "open the PR"', 'row-3'))
    expect(await footer()).toEqual(['auto-accept'])
    await $.session.append(reply('**▸ 6/7 · Review** · reviewer', 'row-4'))
    expect(await footer()).toEqual(['auto-accept', 'laa:fix 6/7'])
  })

  test('drops a run at a turn end that waits on nothing, keeps one waiting on a gate, and forgets it on /clear', async ($, on) => {
    const footers = await world($, on)
    const footer = async () => {
      const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
      await ui.unmount()
      return footers[footers.length - 1]
    }
    await $.skill.prompt(skill('resume'))
    expect(await footer()).toEqual(['auto-accept', 'laa:resume'])
    await $.turn.complete(turnEnd('The run on this branch already finished.'))
    expect(await footer()).toEqual(['auto-accept'])

    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'))
    await $.turn.complete(turnEnd('**★ Approve the plan?** · 4 slices'))
    expect(await footer()).toEqual(['auto-accept', 'laa:feature ★'])

    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} as never })
    expect(await footer()).toEqual(['auto-accept'])
  })

  test("ignores subagents' rows and skills it doesn't track", async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('explore'))
    await $.session.append({ ...reply('**laa:fix** · standard\n\n**▸ 3/7 · Investigate**'), agentId: 'agent-1' })
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ type: 'Text', text: /●|★/ })).toBeUndefined()
    await band.unmount()
  })
})

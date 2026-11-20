import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { gateText, runTag, spinnerText, turnTagFor } from '../hooks/labels'
import { bash, BAND_SURFACES, fakeRepo, HINT, reply, show, skill, SPINNER, spawnWf, TURN, turnEnd, WF_LAUNCHED, wfCall } from './fake'

const MINIMAL = { options: { visuals: 'minimal' } }
const ENGINE_OWN = '<Box key="engine" />'

// A repo on a task branch with the engine's own rows beneath the plugin. Returns the props each site's last
// draw handed the engine, which is where a rewritten spinner message or hint shows.
async function world($: Engine, on: On) {
  fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, results: { Workflow: WF_LAUNCHED } })
  const clock = mock.clock(on)
  const handed: Record<string, Record<string, unknown>> = {}
  on('ui.render', ($, e) => {
    handed[e.component] = { ...e.props }
    return $.ui.resolve(e).Box({ key: 'engine' })
  })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'agent_test1' }))
  await $.tool.call(bash('git switch -'))
  return { clock, handed }
}

const CLOSING = '**✓ Shipped** · export\n\n**Next**\n- `/laa:retro`: capture what we learned'

const run = { skill: 'fix', step: null, gate: null, engine: null }
const step = { n: 3, last: 7, title: 'Investigate' }

describe('run labels', () => {
  test('the footer tag: the skill, then the gate or the step', () => {
    expect(runTag(run)).toBe('laa:fix')
    expect(runTag({ ...run, step })).toBe('laa:fix 3/7')
    expect(runTag({ ...run, step, gate: 'Approve the plan?' })).toBe('laa:fix ★')
  })

  test('the spinner line: a gate, else the engine and its phase, else the step, else the skill', () => {
    expect(spinnerText(run, null)).toBe('laa:fix')
    expect(spinnerText({ ...run, step }, null)).toBe('laa:fix · Investigate 3/7')
    expect(spinnerText({ ...run, step, engine: 'investigate' }, null)).toBe('laa:fix · engine investigate')
    expect(spinnerText({ ...run, step, engine: 'investigate' }, 'Verify')).toBe('laa:fix · engine investigate · Verify')
    expect(spinnerText({ ...run, skill: 'feature', step, engine: 'investigate', gate: 'Approve the plan?' }, 'Verify')).toBe('laa:feature · ★ Approve the plan?')
  })

  test('the prompt hint at a gate', () => {
    expect(gateText({ ...run, gate: 'Approve the plan?' })).toBe('★ waiting on you: Approve the plan?')
  })

  test("a turn's tag is found by the nearest duration within 50 ms, the newest on a tie", () => {
    const tags = [{ ms: 4321, tag: 'laa:fix 3/7' }, { ms: 900, tag: 'laa:fix 4/7' }, { ms: 4321, tag: 'laa:fix 5/7' }]
    expect(turnTagFor(tags, 4321)).toBe('laa:fix 5/7')
    expect(turnTagFor(tags, 900)).toBe('laa:fix 4/7')
    // The line's duration may be a few milliseconds off the one the turn ended with.
    expect(turnTagFor(tags, 4320)).toBe('laa:fix 5/7')
    expect(turnTagFor(tags, 4322)).toBe('laa:fix 5/7')
    expect(turnTagFor(tags, 4371)).toBe('laa:fix 5/7')
    expect(turnTagFor(tags, 4372)).toBeNull()
    expect(turnTagFor(tags, 4400)).toBeNull()
    expect(turnTagFor([], 4321)).toBeNull()
  })

  test('a turn outside any run keeps its own empty tag beside a tagged neighbour', () => {
    const tags = [{ ms: 4321, tag: 'laa:fix 3/7' }, { ms: 4324, tag: null }]
    expect(turnTagFor(tags, 4324)).toBeNull()
    expect(turnTagFor(tags, 4323)).toBeNull()
    expect(turnTagFor(tags, 4322)).toBe('laa:fix 3/7')
    // Equally near both: the newer turn's.
    expect(turnTagFor([{ ms: 4320, tag: 'laa:fix 3/7' }, { ms: 4324, tag: null }], 4322)).toBeNull()
    expect(turnTagFor([{ ms: 4320, tag: null }, { ms: 4324, tag: 'laa:fix 3/7' }], 4322)).toBe('laa:fix 3/7')
  })
})

describe('spinner', () => {
  test('leaves the line alone while no run is active', async ($, on) => {
    const { handed } = await world($, on)
    for (const surface of BAND_SURFACES) {
      const ui = await $.ui.mount({ ...SPINNER, surface })
      expect(show(await ui.drawn())).toBe(ENGINE_OWN)
      expect(handed.Spinner).toEqual(SPINNER.props)
      await ui.unmount()
    }
  })

  test('names the run, then its step, on the terminal and the desktop', async ($, on) => {
    const { handed } = await world($, on)
    const message = async (surface: 'terminal' | 'desktop', props = SPINNER.props) => {
      const ui = await $.ui.mount({ ...SPINNER, props, surface })
      expect(show(await ui.drawn())).toBe(ENGINE_OWN)
      await ui.unmount()
      return handed.Spinner?.message
    }
    await $.skill.prompt(skill('fix'))
    expect(await message('terminal')).toBe('laa:fix')
    expect(await message('desktop')).toBe('laa:fix')
    await $.session.append(reply('**laa:fix** · standard · workflow mode\n\n**▸ 3/7 · Investigate** · 5 angles'))
    expect(await message('terminal')).toBe('laa:fix · Investigate 3/7')
    expect(await message('desktop')).toBe('laa:fix · Investigate 3/7')
    // Everything but the message goes on as the engine had it.
    expect(handed.Spinner).toEqual({ ...SPINNER.props, message: 'laa:fix · Investigate 3/7' })
  })

  test('keeps the live step beside the run on the desktop, where the word says what the row is doing', async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    const props = { ...SPINNER.props, word: 'Creating notes.md' }
    const desktop = await $.ui.mount({ ...SPINNER, props, surface: 'desktop' })
    expect(handed.Spinner?.message).toBe('laa:fix · Investigate 3/7 · Creating notes.md')
    await desktop.unmount()
    // The terminal's word is a sampled verb, not the step.
    const terminal = await $.ui.mount({ ...SPINNER, props: { ...SPINNER.props, word: 'Sauteing' }, surface: 'terminal' })
    expect(handed.Spinner?.message).toBe('laa:fix · Investigate 3/7')
    await terminal.unmount()
  })

  test('names the engine, and its phase once its agents start', async ($, on) => {
    const { clock, handed } = await world($, on)
    const message = async () => {
      const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
      await ui.unmount()
      return handed.Spinner?.message
    }
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    await $.tool.call(wfCall())
    expect(await message()).toBe('laa:fix · engine investigate')
    await $.agent.spawn(spawnWf('investigate:logs'))
    await $.agent.spawn(spawnWf('investigate:recent-changes', { agentIndex: 2 }))
    // The spawns are counted a moment later, all at once.
    expect(await message()).toBe('laa:fix · engine investigate')
    await clock.advance(200)
    expect(await message()).toBe('laa:fix · engine investigate · Investigate')
    await $.agent.spawn(spawnWf('cluster', { agentIndex: 3 }))
    await $.agent.spawn(spawnWf('verify:1:logic', { agentIndex: 4 }))
    await clock.advance(200)
    expect(await message()).toBe('laa:fix · engine investigate · Verify')
  })

  test('says a gate is waiting', async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'))
    for (const surface of BAND_SURFACES) {
      const ui = await $.ui.mount({ ...SPINNER, surface })
      expect(handed.Spinner?.message).toBe('laa:feature · ★ Approve the plan?')
      await ui.unmount()
    }
  })

  test("never hides a message the engine set itself", async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    const props = { ...SPINNER.props, message: 'Compacting conversation' }
    for (const surface of BAND_SURFACES) {
      const ui = await $.ui.mount({ ...SPINNER, props, surface })
      expect(handed.Spinner).toEqual(props)
      await ui.unmount()
    }
  })
})

describe('prompt hint', () => {
  test('says a gate waits on the person: as the tail on the terminal, in the hint on the desktop', async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'))

    let ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
    expect(show(await ui.drawn())).toBe(ENGINE_OWN)
    // The engine's own line stays, pills and all.
    expect(handed.PromptHint).toEqual({ ...HINT.props, tail: '★ waiting on you: Approve the plan?' })
    await ui.unmount()

    ui = await $.ui.mount({ ...HINT, props: { ...HINT.props, tail: 'notes: 2' }, surface: 'terminal' })
    expect(handed.PromptHint?.tail).toBe('notes: 2 · ★ waiting on you: Approve the plan?')
    await ui.unmount()

    const desktop = await $.ui.mount({ ...HINT, surface: 'desktop' })
    expect(handed.PromptHint).toEqual({ ...HINT.props, hint: '? for shortcuts · ★ waiting on you: Approve the plan?' })
    await desktop.unmount()
  })

  test('changes nothing while a turn is working, and nothing when no gate waits', async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices** · 4 slices'))
    for (const surface of BAND_SURFACES) {
      const ui = await $.ui.mount({ ...HINT, surface })
      expect(handed.PromptHint).toEqual(HINT.props)
      await ui.unmount()
    }
    await $.session.append(reply('**★ Approve the plan?** · 4 slices', 'row-2'))
    const working = { ...HINT.props, isWorking: true, hint: 'esc to interrupt' }
    for (const surface of BAND_SURFACES) {
      const ui = await $.ui.mount({ ...HINT, props: working, surface })
      expect(handed.PromptHint).toEqual(working)
      await ui.unmount()
    }
  })
})

describe('turn duration', () => {
  test("names the run on the line of the turn that belonged to it, and on no other turn's", async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices** · 4 slices'))
    await $.turn.complete({ ...turnEnd('**★ Approve the plan?** · 4 slices'), durationMs: 4321 })

    const own = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs: 4321 }, surface: 'terminal' })
    expect(show(await own.drawn())).toBe([
      '<Box key="laa-turn">',
      '  <Box key="engine" />',
      '  <Text dimColor>" · " "laa:feature ★"</Text>',
      '</Box>',
    ].join('\n'))
    await own.unmount()

    // The line's own duration can differ from the turn's by a few milliseconds: it is still that turn's line.
    for (const durationMs of [4320, 4322]) {
      const near = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs }, surface: 'terminal' })
      expect(show(await near.drawn()), `${durationMs} ms`).toContain('"laa:feature ★"')
      await near.unmount()
    }
    for (const durationMs of [4400, 1000]) {
      const other = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs }, surface: 'terminal' })
      expect(show(await other.drawn()), `${durationMs} ms`).toBe(ENGINE_OWN)
      await other.unmount()
    }
  })

  test("a turn outside any run, a few milliseconds from a run's turn, keeps the engine's own line", async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices** · 4 slices'))
    await $.turn.complete({ ...turnEnd('**★ Approve the plan?** · 4 slices'), durationMs: 4321 })
    await $.session.append(reply(CLOSING, 'row-2'))
    await $.turn.complete({ ...turnEnd(CLOSING), durationMs: 900 })
    // No run is set any more: this turn is nobody's, 3 ms from the tagged one.
    await $.turn.complete({ ...turnEnd('Done.'), durationMs: 4324 })
    const plain = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs: 4324 }, surface: 'terminal' })
    expect(show(await plain.drawn())).toBe(ENGINE_OWN)
    await plain.unmount()
    const tagged = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs: 4321 }, surface: 'terminal' })
    expect(show(await tagged.drawn())).toContain('"laa:feature ★"')
    await tagged.unmount()
  })

  test('leaves the line of a turn outside any run alone', async ($, on) => {
    await world($, on)
    await $.turn.complete({ ...turnEnd('Done.'), durationMs: 4321 })
    const ui = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs: 4321 }, surface: 'terminal' })
    expect(show(await ui.drawn())).toBe(ENGINE_OWN)
    await ui.unmount()
  })
})

describe('visuals: minimal', () => {
  test('leaves the spinner, the prompt hint, and the turn line to the engine', MINIMAL, async ($, on) => {
    const { clock, handed } = await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'))
    await $.tool.call(wfCall('laa:design-panel'))
    await $.agent.spawn(spawnWf('architect:1'))
    await clock.advance(200)
    await $.turn.complete({ ...turnEnd('**★ Approve the plan?** · 4 slices'), durationMs: 4321 })

    for (const surface of BAND_SURFACES) {
      const spinner = await $.ui.mount({ ...SPINNER, surface })
      expect(show(await spinner.drawn()), surface).toBe(ENGINE_OWN)
      expect(handed.Spinner, surface).toEqual(SPINNER.props)
      await spinner.unmount()
      const hint = await $.ui.mount({ ...HINT, surface })
      expect(show(await hint.drawn()), surface).toBe(ENGINE_OWN)
      expect(handed.PromptHint, surface).toEqual(HINT.props)
      await hint.unmount()
    }
    const turn = await $.ui.mount({ ...TURN, props: { ...TURN.props, durationMs: 4321 }, surface: 'terminal' })
    expect(show(await turn.drawn())).toBe(ENGINE_OWN)
    await turn.unmount()
  })
})

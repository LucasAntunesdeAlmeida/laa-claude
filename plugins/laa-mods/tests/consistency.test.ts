import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { decodeCells, paletteOf } from '../hooks/draw'
import {
  ALL_SURFACES, asked, BAND, BAND_SURFACES, bash, commandRun, fakeRepo, FOOTER, golden, HINT, notification, PANE, reply, show, skill,
  SPINNER, spawnWf, TURN, turnEnd, typed, WF, WF_LAUNCHED, wfCall,
} from './fake'
import type { Drawn, Fake } from './fake'

// One run, every place laa draws it: the band and its stepper, the footer, the spinner, the prompt hint, the
// turn's closing line, the engine card, and the report card must say the same thing at the same moment, and
// between them use red at most once. Each place is pinned on its own in its own test file; here they are
// read side by side. Every branch, id, and report is invented.

const MINIMAL = { options: { visuals: 'minimal' } }
const ENGINE_OWN = '<Box key="engine" />'
const BRANCH = 'fix/invoice-500'
const REVIEW_FILE = '.claude/laa/local/last-review.md'

type Node = Exclude<Drawn, string>
type Surface = (typeof ALL_SURFACES)[number]

// A repo with the engine's own drawing of every site beneath the plugin, and one git command so the plugin
// reads the repo. Returns a clock to move and the props the last draw of each site handed the engine,
// absent while the plugin drew the site itself.
async function world($: Engine, on: On, f: Fake = {}) {
  fakeRepo(on, { branch: BRANCH, mapAge: 1, results: { Workflow: WF_LAUNCHED }, ...f })
  const clock = mock.clock(on)
  const handed: Record<string, Record<string, unknown> | undefined> = {}
  on('ui.render', ($, e) => {
    handed[e.component] = { ...e.props }
    return $.ui.resolve(e).Box({ key: 'engine' })
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'agent_test1' }))
  await $.tool.call(bash('git status'))
  return { clock, handed }
}

// A block of the model's reply, and a laa engine's Workflow row, as the transcript raises them.
const block = (text: string) => ({ plugin: 'laa-mods', component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true } })
const WF_ROW = {
  plugin: 'laa-mods',
  component: 'ToolUse' as const,
  props: { tool_use_id: WF.toolUseId, tool: 'Workflow', input: { name: 'laa:investigate', args: { bug: 'x' } } as unknown, isRunning: false, isErrored: false, isInterrupted: false },
}

// A site as one surface draws it. Each target is mounted, read, and taken down, so nothing stays subscribed.
async function drawn($: Engine, target: Parameters<Engine['ui']['mount']>[0]) {
  const ui = await $.ui.mount(target)
  const tree = (await ui.drawn()) as Drawn
  await ui.unmount()
  return tree
}

const textOf = (node: Drawn): string => (typeof node === 'string' ? node : ((node.children ?? []) as Drawn[]).map(textOf).join(''))

// The element of a drawn tree with the given key.
const keyed = (node: Drawn, key: string): Node | undefined => {
  if (typeof node === 'string') return undefined
  if (node.props?.key === key) return node
  for (const child of (node.children ?? []) as Drawn[]) {
    const found = keyed(child, key)
    if (found) return found
  }
  return undefined
}

// The band on a surface: its first row as text, and its second row (the stepper) when it has one.
async function band($: Engine, surface: (typeof BAND_SURFACES)[number]) {
  const tree = await drawn($, { ...BAND, surface })
  const row1 = keyed(tree, 'laa')
  return { tree, row1: row1 ? textOf(row1) : '', steps: keyed(tree, 'laa-steps') }
}

// What the footer and the spinner say, read off what the plugin handed the engine for them.
async function footer($: Engine, handed: Record<string, Record<string, unknown> | undefined>) {
  expect(show(await drawn($, { ...FOOTER, surface: 'terminal' }))).toBe(ENGINE_OWN)
  return handed.SessionMode?.modes
}
async function spinner($: Engine, handed: Record<string, Record<string, unknown> | undefined>, surface: 'terminal' | 'desktop' = 'terminal') {
  expect(show(await drawn($, { ...SPINNER, surface }))).toBe(ENGINE_OWN)
  return handed.Spinner?.message
}
const turnLine = ($: Engine, durationMs: number) => drawn($, { ...TURN, props: { ...TURN.props, durationMs }, surface: 'terminal' })

// How many places in a drawn tree use red.
const reds = (tree: Drawn) => show(tree).split('"error"').length - 1

const STEP_3 = '**laa:fix** · standard · workflow mode\n\n**▸ 3/7 · Investigate** · 5 angles'
const GATE_5 = '**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'

const FIXED = [
  '**✓ Fixed** · nil address',
  '',
  '- **Branch** fix/invoice-500 · 2 commits · not pushed',
  '- **Tests** `go test ./billing/...` ✓',
  '',
  '**Next**',
  '- `/laa:review`: check the branch before the PR',
].join('\n')

const failed = (cause: string) => `**✗ Tests still fail** · billing/export\n- **Cause** ${cause}\n\n**Next**\n- say "retry": runs the tests again`

const WF_FAILED = `<task-id>${WF.taskId}</task-id>\n<tool-use-id>${WF.toolUseId}</tool-use-id>\n<status>failed</status>\n<summary>Workflow "investigate" failed</summary>`

// An invented saved review with both tags the 0.3.0 pane drew in red.
const REVIEW = [
  '# Review · fix/invoice-500 against main',
  '',
  '## CRIT · internal/billing/invoice.go:3 · nil address dereference on legacy rows',
  '- fix: guard with addr == nil',
  '- status: open',
  '',
  '## HIGH · internal/billing/invoice.go:8 · query in a loop over line items',
  '- status: open',
  '',
].join('\n')

describe('a fix run at step 3 of 7', () => {
  test('the band, the stepper, the footer, the spinner, and the turn line all say laa:fix at investigate', async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply(STEP_3))

    const terminal = await band($, 'terminal')
    expect(terminal.row1).toBe(`laa · ${BRANCH} · ● laa:fix ▸ 3/7 Investigate`)
    expect(terminal.steps?.type).toBe('Raster')
    expect(decodeCells(String(terminal.steps?.props?.cells)).text)
      .toBe('✓ context ━ ✓ size ━ ✓ repro ━ ● investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro')
    // The desktop spells the same row in Text, with the same one step lit.
    const desktop = await band($, 'desktop')
    expect(desktop.row1).toBe(terminal.row1)
    expect(textOf(desktop.steps ?? '')).toBe(decodeCells(String(terminal.steps?.props?.cells)).text)
    expect(((desktop.steps?.children ?? []) as Node[]).filter(t => !t.props?.dimColor).map(textOf)).toEqual(['● investigate'])

    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:fix 3/7'])
    expect(await spinner($, handed)).toBe('laa:fix · Investigate 3/7')
    expect(await spinner($, handed, 'desktop')).toBe('laa:fix · Investigate 3/7')

    // The turn ends while the run stands at the step: its closing line carries the footer's own tag, though
    // the line's duration is a few milliseconds off the turn's.
    await $.turn.complete({ ...turnEnd(STEP_3), durationMs: 4321 })
    expect(show(await turnLine($, 4324))).toBe(golden(`
      <Box key="laa-turn">
        <Box key="engine" />
        <Text dimColor>" · " "laa:fix 3/7"</Text>
      </Box>
    `))
  })
})

describe('a feature run at the ★ gate of step 5', () => {
  test('the stepper stars plan, the hint and the spinner say what waits, the footer shows the star', async ($, on) => {
    const { handed } = await world($, on, { branch: 'feat/export', theme: 'dark' })
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply(GATE_5))

    const terminal = await band($, 'terminal')
    expect(terminal.row1).toBe('laa · feat/export · ★ laa:feature · waiting on you: Approve the plan?')
    const cells = decodeCells(String(terminal.steps?.props?.cells))
    expect(cells.text).toBe('✓ context ━ ✓ size ━ ✓ explore ━ ✓ clarify ━ ✓ design ━ ★ plan ━ ○ build ━ ○ review ━ ○ retro')
    // Only the starred step is in the gate tint; every other cell is the theme's gray.
    const at = cells.text.indexOf('★ plan')
    const { gate, muted } = paletteOf('dark')
    expect(cells.fg.map((fg, i) => (fg === gate ? cells.text.charAt(i) : '')).join('')).toBe('★ plan')
    expect(cells.fg.filter((_, i) => i < at || i >= at + '★ plan'.length).every(fg => fg === muted)).toBe(true)

    const desktop = await band($, 'desktop')
    expect(textOf(desktop.steps ?? '')).toBe(cells.text)
    const lit = ((desktop.steps?.children ?? []) as Node[]).filter(t => !t.props?.dimColor)
    expect(lit.map(t => [textOf(t), t.props?.color])).toEqual([['★ plan', 'permission']])

    // The hint: the terminal's tail, the desktop's hint, the same words.
    expect(show(await drawn($, { ...HINT, surface: 'terminal' }))).toBe(ENGINE_OWN)
    expect(handed.PromptHint).toEqual({ ...HINT.props, tail: '★ waiting on you: Approve the plan?' })
    expect(show(await drawn($, { ...HINT, surface: 'desktop' }))).toBe(ENGINE_OWN)
    expect(handed.PromptHint).toEqual({ ...HINT.props, hint: `${HINT.props.hint} · ★ waiting on you: Approve the plan?` })

    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature ★'])
    expect(await spinner($, handed)).toBe('laa:feature · ★ Approve the plan?')
    expect(await spinner($, handed, 'desktop')).toBe('laa:feature · ★ Approve the plan?')

    // The turn ends to wait on the gate: the run stays everywhere, and the turn's line carries the star.
    await $.turn.complete({ ...turnEnd(GATE_5), durationMs: 4321 })
    expect(textOf(await turnLine($, 4321))).toBe(' · laa:feature ★')
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature ★'])
    expect(decodeCells(String((await band($, 'terminal')).steps?.props?.cells)).text).toBe(cells.text)
  })
})

describe('once the person answers a text gate', () => {
  const PLAN = '✓ context ━ ✓ size ━ ✓ explore ━ ✓ clarify ━ ✓ design ━ ● plan ━ ○ build ━ ○ review ━ ○ retro'

  // A feature run that asked its gate in text and ended the turn to wait for the answer.
  async function waiting($: Engine) {
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply(GATE_5))
    await $.turn.complete(turnEnd(GATE_5))
  }

  test('the spinner, the stepper, the band, the footer, and the hint show the step while Claude works on it', async ($, on) => {
    const { handed } = await world($, on, { branch: 'feat/export' })
    await waiting($)
    expect(await spinner($, handed)).toBe('laa:feature · ★ Approve the plan?')

    await $.session.append(typed('Approve, but split slice 3.'))
    // A reply in prose, with no step line of its own.
    await $.session.append(reply('Splitting slice 3 into two.', 'row-2'))

    for (const surface of BAND_SURFACES) expect(await spinner($, handed, surface), surface).toBe('laa:feature · Plan slices 5/8')
    const terminal = await band($, 'terminal')
    expect(terminal.row1).toBe('laa · feat/export · ● laa:feature ▸ 5/8 Plan slices')
    expect(decodeCells(String(terminal.steps?.props?.cells)).text).toBe(PLAN)
    expect(textOf((await band($, 'desktop')).steps ?? '')).toBe(PLAN)
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature 5/8'])
    for (const surface of BAND_SURFACES) {
      expect(show(await drawn($, { ...HINT, surface })), surface).toBe(ENGINE_OWN)
      expect(handed.PromptHint, surface).toEqual(HINT.props)
    }
  })

  test('an answer given in an AskUserQuestion dialog clears it too', async ($, on) => {
    const { handed } = await world($, on, { branch: 'feat/export' })
    await waiting($)
    await $.session.append(asked('Approve'))
    expect(await spinner($, handed)).toBe('laa:feature · Plan slices 5/8')
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature 5/8'])
  })

  test('a task notification or a follow-up the person did not type leaves the gate waiting', async ($, on) => {
    const { handed } = await world($, on, { branch: 'feat/export' })
    await waiting($)
    await $.session.append(notification('task t9 completed'))
    await $.session.append({ ...notification('task t9 completed', 'row-n2'), door: 'prompt' as const, origin: { kind: 'task-notification' as const } })
    await $.session.append({ ...typed('Continue.', 'row-p2'), origin: { kind: 'auto-continuation' as const } })
    await $.session.append({ ...typed('Nightly check.', 'row-p3'), origin: { kind: 'scheduled-trigger' as const } })
    expect(await spinner($, handed)).toBe('laa:feature · ★ Approve the plan?')
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature ★'])
    expect(decodeCells(String((await band($, 'terminal')).steps?.props?.cells)).text).toContain('★ plan')
    expect(show(await drawn($, { ...HINT, surface: 'terminal' }))).toBe(ENGINE_OWN)
    expect(handed.PromptHint).toEqual({ ...HINT.props, tail: '★ waiting on you: Approve the plan?' })
  })

  test('under visuals: minimal the gate stays until the next step line, as in 0.3.0', MINIMAL, async ($, on) => {
    const { handed } = await world($, on, { branch: 'feat/export' })
    await waiting($)
    await $.session.append(typed('Approve.'))
    await $.session.append(asked('Approve'))
    await $.session.append(reply('Starting on the slices.', 'row-2'))
    expect((await band($, 'terminal')).row1).toBe('laa · feat/export · ★ laa:feature · waiting on you: Approve the plan?')
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature ★'])
    await $.session.append(reply('**▸ 6/8 · Implement** · 3 slices', 'row-3'))
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:feature 6/8'])
  })
})

describe('while a laa engine runs', () => {
  test('the spinner, the band, and the engine card name the same engine and the same phase', async ($, on) => {
    const { clock, handed } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply(STEP_3))
    await $.tool.call(wfCall())

    // Launched, no agent yet: the engine by name, no phase anywhere.
    expect(await spinner($, handed)).toBe('laa:fix · engine investigate')
    expect((await band($, 'terminal')).row1).toBe(`laa · ${BRANCH} · ● laa:fix ▸ 3/7 Investigate · engine investigate`)
    let card = keyed(await drawn($, { ...WF_ROW, surface: 'terminal' }), 'laa-card')
    expect(textOf(keyed(card ?? '', 'head') ?? '')).toBe('investigate · laa engine')
    expect(textOf(keyed(card ?? '', 'phases') ?? '')).toBe('○ Investigate ━ ○ Cluster ━ ○ Verify')

    const labels = ['investigate:logs', 'investigate:config', 'cluster', 'verify:1:logic']
    for (const [i, label] of labels.entries()) await $.agent.spawn(spawnWf(label, { agentIndex: i + 1 }))
    await clock.advance(200)

    const message = String(await spinner($, handed))
    expect(message).toBe('laa:fix · engine investigate · Verify')
    for (const surface of ALL_SURFACES) {
      card = keyed(await drawn($, { ...WF_ROW, surface }), 'laa-card')
      const phases = ((keyed(card ?? '', 'phases')?.children ?? []) as Node[])
      // The one phase the card lights is the one the spinner ends with, under the engine the spinner names.
      const now = phases.filter(t => !t.props?.dimColor).map(textOf)
      expect(now, surface).toEqual(['● Verify'])
      expect(message.endsWith(` · engine ${textOf(keyed(card ?? '', 'head')?.children?.[0] as Drawn)} · ${String(now[0]).slice(2)}`), surface).toBe(true)
    }
    // The stepper keeps the run's own step while the engine works inside it.
    expect(decodeCells(String((await band($, 'terminal')).steps?.props?.cells)).text).toContain('● investigate')
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:fix 3/7'])
  })
})

describe('after the closing report', () => {
  test('the run is gone from the band, the footer, and the spinner, and the report is framed', async ($, on) => {
    const { handed } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply(STEP_3))
    expect((await band($, 'terminal')).steps?.type).toBe('Raster')
    await $.session.append(reply(FIXED, 'row-2'))
    await $.turn.complete({ ...turnEnd(FIXED), durationMs: 4321 })

    for (const surface of BAND_SURFACES) {
      // One row again, the 0.3.0 one: no run in it, no stepper under it.
      expect(show((await band($, surface)).tree), surface).toBe(golden(`
        <Box key="laa">
          <Text dimColor>"laa · "</Text>
          <Text>"${BRANCH}"</Text>
        </Box>
      `))
      expect(await spinner($, handed, surface), surface).toBeNull()
      expect(handed.Spinner, surface).toEqual(SPINNER.props)
    }
    expect(await footer($, handed)).toEqual(FOOTER.props.modes)
    expect(show(await drawn($, { ...HINT, surface: 'terminal' }))).toBe(ENGINE_OWN)
    expect(handed.PromptHint).toEqual(HINT.props)
    // The run had ended by the time the turn did: its line names none.
    expect(show(await turnLine($, 4321))).toBe(ENGINE_OWN)

    for (const surface of ALL_SURFACES) {
      const tree = await drawn($, { ...block(FIXED), surface })
      expect(keyed(tree, 'laa-report'), surface).toBeDefined()
      expect(keyed(tree, 'frame')?.props, surface).toMatchObject({ borderStyle: 'round', borderColor: 'success' })
      expect(textOf(keyed(tree, 'frame')?.children?.[0] as Drawn), surface).toBe('✓ Fixed · nil address')
    }
  })
})

describe('visuals: minimal', () => {
  test('draws the single 0.3.0 band row and leaves every other place to the engine', MINIMAL, async ($, on) => {
    const { clock, handed } = await world($, on, { theme: 'dark' })
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply(STEP_3))
    await $.tool.call(wfCall())
    await $.agent.spawn(spawnWf('investigate:logs'))
    await clock.advance(200)
    await $.turn.complete({ ...turnEnd(STEP_3), durationMs: 4321 })

    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface)).tree), surface).toBe(golden(`
        <Box key="laa">
          <Text dimColor>"laa · "</Text>
          <Text>"${BRANCH}"</Text>
          <Text dimColor>" · "</Text>
          <Box key="run">
            <Text>"● laa:" "fix" " ▸ 3/7 Investigate"</Text>
            <Text dimColor>" · engine " "investigate"</Text>
          </Box>
        </Box>
      `))
      expect(await spinner($, handed, surface), surface).toBeNull()
      expect(handed.Spinner, surface).toEqual(SPINNER.props)
    }
    expect(show(await turnLine($, 4321))).toBe(ENGINE_OWN)
    for (const surface of ALL_SURFACES) {
      expect(show(await drawn($, { ...WF_ROW, surface })), surface).toBe(ENGINE_OWN)
      expect(handed.ToolUse, surface).toEqual(WF_ROW.props)
    }
    // The footer is 0.3.0's own, so it still names the run.
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:fix 3/7'])

    // At a gate: no word of it under the prompt.
    await $.session.append(reply('**★ Go with fix A?** · 2 options', 'row-2'))
    for (const surface of BAND_SURFACES) {
      expect(keyed((await band($, surface)).tree, 'laa-steps'), surface).toBeUndefined()
      expect(show(await drawn($, { ...HINT, surface })), surface).toBe(ENGINE_OWN)
      expect(handed.PromptHint, surface).toEqual(HINT.props)
      expect(await spinner($, handed, surface), surface).toBeNull()
    }
    expect(await footer($, handed)).toEqual([...FOOTER.props.modes, 'laa:fix ★'])

    // The closing report: the engine's own block, unframed.
    await $.session.append(reply(FIXED, 'row-3'))
    await $.turn.complete(turnEnd(FIXED))
    for (const surface of ALL_SURFACES) {
      expect(show(await drawn($, { ...block(FIXED), surface })), surface).toBe(ENGINE_OWN)
      expect(handed.AssistantMessage, surface).toEqual({ text: FIXED, isFirstOfReply: true })
    }
    expect(await footer($, handed)).toEqual(FOOTER.props.modes)
  })
})

describe('one red item across every place', () => {
  // A fix run whose engine failed and that closed with a ✗ report, twice over; a saved review with a CRIT
  // and a HIGH finding open. Returns the two reports, older first.
  async function failTwice($: Engine) {
    const older = failed('a missing import')
    const newest = failed('the fixture ships no address')
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply(STEP_3))
    await $.tool.call(wfCall())
    await $.session.append(notification(WF_FAILED))
    await $.session.append(reply(older, 'row-2'))
    await $.turn.complete(turnEnd(older))
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply(newest, 'row-3'))
    await $.turn.complete(turnEnd(newest))
    await $.command.run(commandRun('laa-findings'))
    return { older, newest }
  }

  // Everything on screen at once on a surface: the band where the surface has one, both reports, the
  // engine card, and the findings pane.
  async function screen($: Engine, surface: Surface, reports: { older: string; newest: string }) {
    return {
      band: surface === 'terminal' || surface === 'desktop' ? (await band($, surface)).tree : '',
      older: await drawn($, { ...block(reports.older), surface }),
      newest: await drawn($, { ...block(reports.newest), surface }),
      card: await drawn($, { ...WF_ROW, surface }),
      pane: await drawn($, { ...PANE.findings, surface }),
    }
  }

  test('with the default branch blocked, the band has the red: both ✗ frames and the failed card are warning', async ($, on) => {
    await world($, on, { branch: 'main', files: { [REVIEW_FILE]: REVIEW } })
    const reports = await failTwice($)
    for (const surface of ALL_SURFACES) {
      const s = await screen($, surface, reports)
      if (s.band !== '') {
        expect(show(s.band), surface).toContain('<Text color="error">"✗ " "main" " · edits blocked"</Text>')
        expect(reds(s.band), surface).toBe(1)
      }
      for (const report of [s.older, s.newest]) {
        expect(keyed(report, 'frame')?.props?.borderColor, surface).toBe('warning')
        expect(reds(report), surface).toBe(0)
      }
      expect(show(s.card), surface).toContain('<Text color="warning" wrap="truncate-end">"✗ failed"</Text>')
      expect(reds(s.card), surface).toBe(0)
      expect(reds(s.pane), surface).toBe(0)
    }
  })

  test('without the block, only the newest ✗ frame is red: its border and its status line, one item', async ($, on) => {
    await world($, on, { files: { [REVIEW_FILE]: REVIEW } })
    const reports = await failTwice($)
    for (const surface of ALL_SURFACES) {
      const s = await screen($, surface, reports)
      expect(reds(s.band), surface).toBe(0)
      const frame = keyed(s.newest, 'frame')
      expect(frame?.props?.borderColor, surface).toBe('error')
      expect((frame?.children?.[0] as Node).props, surface).toEqual({ bold: true, color: 'error' })
      expect(reds(s.newest), surface).toBe(2)
      expect(keyed(s.older, 'frame')?.props?.borderColor, surface).toBe('warning')
      expect(reds(s.older), surface).toBe(0)
      expect(show(s.card), surface).toContain('<Text color="warning" wrap="truncate-end">"✗ failed"</Text>')
      expect(reds(s.card), surface).toBe(0)
      // The pane's CRIT and HIGH tags, red in 0.3.0, are warning here.
      expect(reds(s.pane), surface).toBe(0)
      expect(show(s.pane), surface).toContain('<Text bold color="warning">"CRIT  "</Text>')
    }
  })
})

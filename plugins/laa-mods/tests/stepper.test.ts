import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Run } from '../types'
import { decodeCells, DEFAULT_FG, paletteOf } from '../hooks/draw'
import type { Els } from '../hooks/draw'
import { stepNumbersOf } from '../hooks/git'
import { layoutStepper, stepperOf, stepperRow } from '../hooks/stepper'
import type { Stepper } from '../hooks/stepper'
import { lastOf, STEPS, tableFor } from '../hooks/tables'
import { BAND, BAND_SURFACES, bash, fakeRepo, golden, reply, show, skill } from './fake'
import type { Drawn, Fake } from './fake'

// The stepper: the band's second row under `visuals: full`. Every repo, branch, and journal here is invented.

const BRANCH = 'feat/export'
const JOURNAL = '.claude/laa/local/runs/feat-export.md'
const PLAIN = paletteOf(null)
const DARK = paletteOf('dark')

const fixRun = (n: number | null, extra: Partial<Run> = {}): Run => ({
  skill: 'fix',
  step: n === null ? null : { n, last: 7, title: STEPS.fix?.steps[n]?.title ?? '' },
  gate: null,
  engine: null,
  ...extra,
})

// A stepper that must be there.
const must = (s: Stepper | null): Stepper => {
  if (!s) throw new Error('no stepper')
  return s
}

const textOf = (s: Stepper | null, columns: number) => layoutStepper(must(s), columns, PLAIN)?.map(span => span.text).join('') ?? null
const marksOf = (s: Stepper | null) => must(s).steps.map(step => step.mark)

// The row as its widest form spells it, written out here on its own: every step before `n` done, `glyph` at `n`.
const fullRow = (name: string, n: number, glyph: string) => {
  const t = STEPS[name]
  if (!t) throw new Error(`no steps for ${name}`)
  return t.steps.map((s, i) => `${i < n - t.first ? '✓' : i === n - t.first ? glyph : '○'} ${s.label}`).join(' ━ ')
}

// The band's first row as 0.3.0 drew it on a task branch with nothing else to say.
const runRow = (name: string, step: string) => golden(`
  <Box key="laa">
    <Text dimColor>"laa · "</Text>
    <Text>"${BRANCH}"</Text>
    <Text dimColor>" · "</Text>
    <Box key="run">
      <Text>"● laa:" "${name}" ${JSON.stringify(step)}</Text>
    </Box>
  </Box>
`)
const gateRow = (name: string, gate: string) => golden(`
  <Box key="laa">
    <Text dimColor>"laa · "</Text>
    <Text>"${BRANCH}"</Text>
    <Text dimColor>" · "</Text>
    <Text color="permission">"★ laa:" "${name}" " · waiting on you: " "${gate}"</Text>
  </Box>
`)
const pausedRow = (name: string, step: string) => golden(`
  <Box key="laa">
    <Text dimColor>"laa · "</Text>
    <Text>"${BRANCH}"</Text>
    <Text dimColor>" · "</Text>
    <Box key="paused">
      <Text dimColor>"○ paused laa:" "${name}" ${JSON.stringify(step)}</Text>
      <Text color="suggestion">" → /laa:resume"</Text>
    </Box>
  </Box>
`)

const journal = (name: string, step: string, gate: string | null) =>
  `# laa:${name} · ${BRANCH}\n- status: waiting\n- step: ${step}\n${gate ? `- gate: ★ ${gate}\n` : ''}`

// A repo on a task branch with the engine's own band and skill expansion beneath the plugin, and one git
// command so the plugin reads the repo.
async function world($: Engine, on: On, f: Fake = {}) {
  const seen = fakeRepo(on, { branch: BRANCH, mapAge: 1, ...f })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  await $.tool.call(bash('git status'))
  return seen
}

type Node = Exclude<Drawn, string>

// The band as drawn on a surface: the whole tree, and its two rows when it has two.
async function band($: Engine, surface: (typeof BAND_SURFACES)[number], props: Partial<typeof BAND.props> = {}) {
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, ...props }, surface })
  const tree = (await ui.drawn()) as Node
  await ui.unmount()
  const isBand = tree.props?.key === 'laa-band'
  const rows = (isBand ? tree.children ?? [] : []) as Node[]
  return { tree, isBand, row1: rows[0], row2: rows[1] }
}

// The text a drawn Raster spells, and the colors it spells it in.
const cellsOf = (node: Node | undefined) => decodeCells(String(node?.props?.cells ?? ''))

// The second row in its Text form, as one string, and the Text nodes it is made of.
const textForm = (node: Node | undefined) => {
  const texts = (node?.children ?? []) as Node[]
  return { text: texts.map(t => (t.children ?? []).join('')).join(''), texts }
}

// Checks both surfaces draw `row1` as 0.3.0 did and `row2` under it: one Raster on the terminal, Text on the desktop.
async function expectStepper($: Engine, row1: string, row2: string, at: string, what: string) {
  const terminal = await band($, 'terminal')
  expect(terminal.isBand, what).toBe(true)
  expect(terminal.tree.props, what).toEqual({ key: 'laa-band', flexDirection: 'column' })
  expect(terminal.tree.children, what).toHaveLength(2)
  expect(show(terminal.row1 ?? ''), what).toBe(row1)
  expect(terminal.row2?.type, what).toBe('Raster')
  expect(terminal.row2?.props, what).toMatchObject({ key: 'laa-steps', columns: row2.length, rows: 1 })
  expect(cellsOf(terminal.row2).text, what).toBe(row2)

  const desktop = await band($, 'desktop')
  expect(show(desktop.row1 ?? ''), what).toBe(row1)
  expect(desktop.row2?.type, what).toBe('Box')
  expect(desktop.row2?.props, what).toEqual({ key: 'laa-steps' })
  const form = textForm(desktop.row2)
  expect(form.text, what).toBe(row2)
  // Everything dim but the current step, which is the only part that may carry a color.
  const lit = form.texts.filter(t => !t.props?.dimColor)
  expect(lit.map(t => (t.children ?? []).join('')), what).toEqual([at])
  expect(form.texts.every(t => t.type === 'Text' && (t.props?.dimColor ? t.props.color === undefined : true)), what).toBe(true)
  return { terminal, desktop, lit }
}

describe('step history', () => {
  test('marks the steps before the current one done, the current one running, the rest to come', () => {
    expect(marksOf(stepperOf({ run: fixRun(3, { seen: [0, 1, 2, 3] }), paused: null })))
      .toEqual(['done', 'done', 'done', 'current', 'todo', 'todo', 'todo', 'todo'])
    expect(stepperOf({ run: fixRun(3, { seen: [0, 1, 2, 3] }), paused: null })).toMatchObject({ at: 3, n: 3, last: 7 })
  })

  test('a step the run never printed, above the lowest it did, was skipped', () => {
    expect(marksOf(stepperOf({ run: fixRun(5, { seen: [0, 1, 3, 5] }), paused: null })))
      .toEqual(['done', 'done', 'skipped', 'done', 'skipped', 'current', 'todo', 'todo'])
  })

  test('steps below the lowest one seen are done: they ran before the first step line', () => {
    expect(marksOf(stepperOf({ run: fixRun(5, { seen: [2, 5] }), paused: null })))
      .toEqual(['done', 'done', 'done', 'skipped', 'skipped', 'current', 'todo', 'todo'])
  })

  test('a run joined mid-way has no history: every earlier step is done', () => {
    expect(marksOf(stepperOf({ run: fixRun(5), paused: null })))
      .toEqual(['done', 'done', 'done', 'done', 'done', 'current', 'todo', 'todo'])
  })

  test('a gate marks the current step, and no step known leaves every step to come', () => {
    expect(marksOf(stepperOf({ run: fixRun(4, { seen: [4], gate: 'Fix it?' }), paused: null }))[4]).toBe('gate')
    const fresh = stepperOf({ run: fixRun(null, { seen: [] }), paused: null })
    expect(marksOf(fresh)).toEqual(Array(8).fill('todo'))
    expect(fresh).toMatchObject({ at: null, n: null, last: null })
    // A gate asked before the first step has no step to stand at.
    expect(marksOf(stepperOf({ run: fixRun(null, { seen: [], gate: 'Which bug?' }), paused: null }))).toEqual(Array(8).fill('todo'))
  })

  test('a paused journal: earlier steps done, its own step ○, or ★ when it waits at a gate', () => {
    const paused = { skill: 'fix', branch: BRANCH, status: 'waiting', step: { n: 2, last: 7, title: 'Reproduce first' }, gate: null }
    expect(marksOf(stepperOf({ run: null, paused }))).toEqual(['done', 'done', 'paused', 'todo', 'todo', 'todo', 'todo', 'todo'])
    expect(marksOf(stepperOf({ run: null, paused: { ...paused, gate: 'Fix it?' } }))[2]).toBe('gate')
    expect(marksOf(stepperOf({ run: null, paused: { ...paused, step: null } }))).toEqual(Array(8).fill('todo'))
    // A run wins over the journal.
    expect(marksOf(stepperOf({ run: fixRun(0, { seen: [0] }), paused }))[0]).toBe('current')
  })

  test('nothing to draw: no run and no journal, an unknown skill, a last step no table has, a step outside its table', () => {
    expect(stepperOf({ run: null, paused: null })).toBeNull()
    expect(stepperOf({ run: { ...fixRun(null), skill: 'retro' }, paused: null })).toBeNull()
    expect(stepperOf({ run: { ...fixRun(3), step: { n: 3, last: 9, title: 'Investigate' } }, paused: null })).toBeNull()
    expect(stepperOf({ run: { ...fixRun(3), step: { n: 8, last: 7, title: 'Investigate' } }, paused: null })).toBeNull()
  })

  test("only resume is drawn from another skill's table", () => {
    // A fix run printing feature's `7/8 · Review`, and a retro journal printing evolve's `1/5 · Gather`.
    expect(tableFor('fix', { n: 7, last: 8, title: 'Review' })).toBe(STEPS.feature)
    expect(stepperOf({ run: { ...fixRun(null), step: { n: 7, last: 8, title: 'Review' } }, paused: null })).toBeNull()
    expect(tableFor('retro', { n: 1, last: 5, title: 'Gather' })).toBe(STEPS.evolve)
    const paused = { skill: 'retro', branch: BRANCH, status: 'waiting', step: { n: 1, last: 5, title: 'Gather' }, gate: null }
    expect(stepperOf({ run: null, paused })).toBeNull()
    expect(stepperOf({ run: null, paused: { ...paused, skill: 'resume' } })).not.toBeNull()
  })

  test("a resume run's own steps are no history of the pipeline it picks up: every earlier step is done", () => {
    const step = { n: 6, last: 7, title: 'Review' }
    const resumed = stepperOf({ run: { skill: 'resume', step, gate: null, engine: null, seen: [1, 2, 3, 6] }, paused: null })
    expect(marksOf(resumed)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'current', 'todo'])
    // While it walks its own steps, its history counts.
    const own = stepperOf({ run: { skill: 'resume', step: { n: 3, last: 3, title: 'Continue' }, gate: null, engine: null, seen: [1, 3] }, paused: null })
    expect(marksOf(own)).toEqual(['done', 'skipped', 'current'])
  })

  test("a resume run printing another skill's steps is drawn from that skill's table, found by the title", () => {
    expect(tableFor('resume', { n: 5, last: 8, title: 'plan slices' })).toBe(STEPS.feature)
    // fix and migrate both end at 7: the title at the step tells them apart.
    expect(tableFor('resume', { n: 2, last: 7, title: 'Pilot' })).toBe(STEPS.migrate)
    expect(tableFor('resume', { n: 2, last: 7, title: 'Reproduce first' })).toBe(STEPS.fix)
    expect(tableFor('resume', { n: 2, last: 7, title: 'Something else' })).toBeNull()
    const resumed = stepperOf({ run: { skill: 'resume', step: { n: 5, last: 8, title: 'Plan slices' }, gate: null, engine: null, seen: [5] }, paused: null })
    expect(textOf(resumed, 120)).toBe('✓ context ━ ✓ size ━ ✓ explore ━ ✓ clarify ━ ✓ design ━ ● plan ━ ○ build ━ ○ review ━ ○ retro')
  })
})

describe('step lines of a block', () => {
  test('every step line is read, in the order printed', () => {
    expect(stepNumbersOf('**▸ 1/7 · Triage the size** · standard\n\n**▸ 2/7 · Reproduce first**')).toEqual([1, 2])
    expect(stepNumbersOf('**laa:fix** · standard\n\n**▸ 3/7 · Investigate** · 5 angles')).toEqual([3])
    expect(stepNumbersOf('**★ Approve the plan?** · 4 slices')).toEqual([])
  })
})

describe('width ladder', () => {
  const at3 = stepperOf({ run: fixRun(3, { seen: [0, 1, 2, 3] }), paused: null })

  test('draws the widest form that fits', () => {
    expect(textOf(at3, 120)).toBe('✓ context ━ ✓ size ━ ✓ repro ━ ● investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro')
    expect(textOf(at3, 84)).toBe(textOf(at3, 120))
    expect(textOf(at3, 83)).toBe(textOf(at3, 70))
    expect(textOf(at3, 70)).toBe('✓ context ✓ size ✓ repro ● investigate ○ decide ○ fix ○ review ○ retro')
    expect(textOf(at3, 69)).toBe(textOf(at3, 40))
    expect(textOf(at3, 40)).toBe('✓ ✓ ✓ ● investigate ○ ○ ○ ○')
    expect(textOf(at3, 26)).toBe(textOf(at3, 20))
    expect(textOf(at3, 20)).toBe('● 3/7 investigate')
    expect(textOf(at3, 12)).toBe('● 3/7 invest')
    expect(textOf(at3, 11)).toBeNull()
    expect(layoutStepper(must(at3), 11, PLAIN)).toBeNull()
  })

  test('never draws wider than it was given, or than a Raster can be', () => {
    for (let columns = 12; columns <= 130; columns += 1) expect(textOf(at3, columns)?.length ?? 0, `${columns}`).toBeLessThanOrEqual(columns)
    expect(textOf(at3, 100000)).toBe(textOf(at3, 512))
    expect(textOf(at3, 40.9)).toBe(textOf(at3, 40))
    expect(textOf(at3, Number.NaN)).toBeNull()
  })

  test('a skipped step is a dim label with no glyph, and a · where only the current step is labelled', () => {
    const skipped = stepperOf({ run: fixRun(5, { seen: [0, 1, 3, 5] }), paused: null })
    expect(textOf(skipped, 120)).toBe('✓ context ━ ✓ size ━ repro ━ ✓ investigate ━ decide ━ ● fix ━ ○ review ━ ○ retro')
    expect(textOf(skipped, 70)).toBe('✓ context ✓ size repro ✓ investigate decide ● fix ○ review ○ retro')
    expect(textOf(skipped, 40)).toBe('✓ ✓ · ✓ · ● fix ○ ○')
  })

  test('the gate and paused marks keep their glyph down the ladder', () => {
    const gate = stepperOf({ run: fixRun(4, { seen: [0, 1, 2, 3, 4], gate: 'Fix it?' }), paused: null })
    expect(textOf(gate, 120)).toBe('✓ context ━ ✓ size ━ ✓ repro ━ ✓ investigate ━ ★ decide ━ ○ fix ━ ○ review ━ ○ retro')
    expect(textOf(gate, 30)).toBe('✓ ✓ ✓ ✓ ★ decide ○ ○ ○')
    expect(textOf(gate, 14)).toBe('★ 4/7 decide')
    const paused = stepperOf({ run: null, paused: { skill: 'fix', branch: BRANCH, status: 'waiting', step: { n: 4, last: 7, title: 'Decide' }, gate: null } })
    expect(textOf(paused, 30)).toBe('✓ ✓ ✓ ✓ ○ decide ○ ○ ○')
    expect(textOf(paused, 14)).toBe('○ 4/7 decide')
  })

  test('with no step known, every step is ○ down to a cut', () => {
    const fresh = stepperOf({ run: fixRun(null, { seen: [] }), paused: null })
    expect(textOf(fresh, 120)).toBe('○ context ━ ○ size ━ ○ repro ━ ○ investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro')
    expect(textOf(fresh, 20)).toBe('○ ○ ○ ○ ○ ○ ○ ○')
    expect(textOf(fresh, 12)).toBe('○ ○ ○ ○ ○ ○ ')
  })

  test("colors: the current step in the terminal's own, the rest muted, only a ★ step in the gate tint", () => {
    const running = layoutStepper(must(at3), 120, DARK) ?? []
    expect(running.map(s => s.fg)).toEqual([DARK.muted, undefined, DARK.muted])
    expect(running[1]?.text).toBe('● investigate')
    const gate = stepperOf({ run: fixRun(0, { seen: [0], gate: 'Go on?' }), paused: null })
    expect(layoutStepper(must(gate), 120, DARK)?.map(s => s.fg)).toEqual([DARK.gate, DARK.muted])
    expect(layoutStepper(must(gate), 12, DARK)).toEqual([{ text: '★ 0/7 contex', fg: DARK.gate }])
    const last = stepperOf({ run: fixRun(7), paused: null })
    expect(layoutStepper(must(last), 120, PLAIN)?.map(s => s.fg)).toEqual([DEFAULT_FG, undefined])
  })
})

describe('stepper row', () => {
  // One test per skill: all nine in one test ran close to the kit's time limit.
  for (const [name, table] of Object.entries(STEPS)) {
    test(`every step of laa:${name}, running and at a gate: a Raster on the terminal, Text on the desktop, row 1 as in 0.3.0`, async ($, on) => {
      await world($, on)
      let row = 0
      for (const [i, def] of table.steps.entries()) {
        const n = table.first + i
        const what = `laa:${name} ${n}/${lastOf(table)}`
        await $.skill.prompt(skill(name))
        await $.session.append(reply(`**▸ ${n}/${lastOf(table)} · ${def.title}**`, `row-${(row += 1)}`))
        const running = await expectStepper($, runRow(name, ` ▸ ${n}/${lastOf(table)} ${def.title}`), fullRow(name, n, '●'), `● ${def.label}`, what)
        expect(running.lit[0]?.props?.color, what).toBeUndefined()
        // No theme was read: every cell is in the terminal's own colors.
        const cells = cellsOf(running.terminal.row2)
        expect(new Set([...cells.fg, ...cells.bg]), what).toEqual(new Set([DEFAULT_FG]))

        await $.session.append(reply('**★ Go on?** · 2 options', `row-${(row += 1)}`))
        const gate = await expectStepper($, gateRow(name, 'Go on?'), fullRow(name, n, '★'), `★ ${def.label}`, `${what} ★`)
        expect(gate.lit[0]?.props?.color, what).toBe('permission')
      }
    })

    test(`every step of laa:${name}, paused with and without a gate`, async ($, on) => {
      const seen = await world($, on)
      for (const [i, def] of table.steps.entries()) {
        const step = `${table.first + i}/${lastOf(table)}`
        for (const gate of [null, 'Go on?']) {
          seen.setFile(JOURNAL, journal(name, `${step} · ${def.title}`, gate))
          await $.tool.call(bash('git status'))
          const glyph = gate ? '★' : '○'
          const drawn = await expectStepper(
            $, pausedRow(name, ` ▸ ${step} ${def.title}`), fullRow(name, table.first + i, glyph), `${glyph} ${def.label}`, `paused laa:${name} ${step} ${glyph}`,
          )
          expect(drawn.lit[0]?.props?.color).toBe(gate ? 'permission' : undefined)
        }
      }
    })
  }

  test('the step tables cover the nine tracked skills, each drawn above', () => {
    expect(Object.keys(STEPS).toSorted()).toEqual(['adopt', 'build', 'evolve', 'feature', 'fix', 'forge', 'migrate', 'resume', 'review'])
  })

  test('a run before its first step: every step to come', async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('review'))
    const terminal = await band($, 'terminal')
    expect(show(terminal.row1 ?? '')).toBe(runRow('review', ''))
    expect(cellsOf(terminal.row2).text).toBe('○ target ━ ○ reviewers ━ ○ panel ━ ○ report')
    const desktop = await band($, 'desktop')
    expect(show(desktop.row2 ?? '')).toBe(golden(`
      <Box key="laa-steps">
        <Text dimColor>"○ target ━ ○ reviewers ━ ○ panel ━ ○ report"</Text>
      </Box>
    `))
  })

  test('a run that skipped a step, drawn whole on both surfaces', async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 0/7 · Load context**', 'row-1'))
    await $.session.append(reply('**▸ 1/7 · Triage the size**', 'row-2'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles', 'row-3'))
    const text = '✓ context ━ ✓ size ━ repro ━ ● investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro'
    const terminal = await band($, 'terminal')
    expect(terminal.row2?.props).toMatchObject({ key: 'laa-steps', columns: text.length, rows: 1 })
    expect(cellsOf(terminal.row2).text).toBe(text)
    const desktop = await band($, 'desktop')
    expect(show(desktop.tree)).toBe(golden(`
      <Box flexDirection="column" key="laa-band">
        <Box key="laa">
          <Text dimColor>"laa · "</Text>
          <Text>"${BRANCH}"</Text>
          <Text dimColor>" · "</Text>
          <Box key="run">
            <Text>"● laa:" "fix" " ▸ 3/7 Investigate"</Text>
          </Box>
        </Box>
        <Box key="laa-steps">
          <Text dimColor>"✓ context ━ ✓ size ━ repro ━ "</Text>
          <Text>"● investigate"</Text>
          <Text dimColor>" ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro"</Text>
        </Box>
      </Box>
    `))
  })

  test('steps printed in one block are each done, not skipped', async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 0/7 · Load context**', 'row-1'))
    await $.session.append(reply('**▸ 1/7 · Triage the size** · standard\n\n**▸ 2/7 · Reproduce first** · test-engineer', 'row-2'))
    const text = '✓ context ━ ✓ size ━ ● repro ━ ○ investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro'
    expect(cellsOf((await band($, 'terminal')).row2).text).toBe(text)
    expect(textForm((await band($, 'desktop')).row2).text).toBe(text)
  })

  test("a resume run printing feature's steps draws feature's stepper", async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('resume'))
    await $.session.append(reply('**▸ 5/8 · Plan slices** · 4 slices'))
    const terminal = await band($, 'terminal')
    expect(show(terminal.row1 ?? '')).toBe(runRow('resume', ' ▸ 5/8 Plan slices'))
    expect(cellsOf(terminal.row2).text).toBe(fullRow('feature', 5, '●'))
  })

  test('a resume run that printed its own steps first draws every earlier step of the pipeline done', async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('resume'))
    await $.session.append(reply('**▸ 1/3 · Find the journal**', 'row-1'))
    await $.session.append(reply('**▸ 2/3 · Rebuild the context**', 'row-2'))
    await $.session.append(reply('**▸ 3/3 · Continue**', 'row-3'))
    expect(cellsOf((await band($, 'terminal')).row2).text).toBe('✓ find ━ ✓ context ━ ● continue')
    await $.session.append(reply('**▸ 6/7 · Review** · reviewer', 'row-4'))
    await expectStepper($, runRow('resume', ' ▸ 6/7 Review'), fullRow('fix', 6, '●'), '● review', 'resumed fix 6/7')
  })

  test("follows the band's width down the ladder, and stops under 12 columns", async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    const want: [number, string][] = [
      [120, '✓ context ━ ✓ size ━ ✓ repro ━ ● investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro'],
      [70, '✓ context ✓ size ✓ repro ● investigate ○ decide ○ fix ○ review ○ retro'],
      [40, '✓ ✓ ✓ ● investigate ○ ○ ○ ○'],
      [20, '● 3/7 investigate'],
      [12, '● 3/7 invest'],
    ]
    for (const [bodyColumns, text] of want) {
      const terminal = await band($, 'terminal', { bodyColumns })
      expect(terminal.row2?.props, `${bodyColumns}`).toMatchObject({ columns: text.length, rows: 1 })
      expect(cellsOf(terminal.row2).text, `${bodyColumns}`).toBe(text)
      expect(textForm((await band($, 'desktop', { bodyColumns })).row2).text, `${bodyColumns}`).toBe(text)
    }
    for (const surface of BAND_SURFACES) {
      const narrow = await band($, surface, { bodyColumns: 11 })
      expect(show(narrow.tree), surface).toBe(runRow('fix', ' ▸ 3/7 Investigate'))
    }
  })
})

describe('no second row', () => {
  test('with no run and no paused journal the band is the 0.3.0 tree', async ($, on) => {
    await world($, on)
    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface)).tree), surface).toBe(golden(`
        <Box key="laa">
          <Text dimColor>"laa · "</Text>
          <Text>"${BRANCH}"</Text>
        </Box>
      `))
    }
  })

  test('with room for one row only', async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface, { maxRows: 1 })).tree), surface).toBe(runRow('fix', ' ▸ 3/7 Investigate'))
      expect((await band($, surface, { maxRows: 2 })).isBand, surface).toBe(true)
    }
  })

  test('when the step line names a last step no table has', async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/9 · Investigate** · 5 angles'))
    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface)).tree), surface).toBe(runRow('fix', ' ▸ 3/9 Investigate'))
    }
  })

  test("for a paused journal of a skill with no step table, even when its step is one of another skill's", async ($, on) => {
    await world($, on, { files: { [JOURNAL]: journal('retro', '1/5 · Gather', null) } })
    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface)).tree), surface).toBe(pausedRow('retro', ' ▸ 1/5 Gather'))
    }
  })

  test("when a skill other than resume prints another skill's step", async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 7/8 · Review** · reviewer'))
    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface)).tree), surface).toBe(runRow('fix', ' ▸ 7/8 Review'))
    }
  })

  test('under visuals: minimal', { options: { visuals: 'minimal' } }, async ($, on) => {
    await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    for (const surface of BAND_SURFACES) {
      expect(show((await band($, surface)).tree), surface).toBe(runRow('fix', ' ▸ 3/7 Investigate'))
    }
  })
})

describe('stepper row, drawn directly', () => {
  const input = { run: fixRun(3, { seen: [0, 1, 2, 3] }), paused: null, columns: 120, maxRows: 4, theme: null as string | null }

  // The element tables as the engine resolves them for the band, taken from beneath the plugin.
  async function tables($: Engine, on: On) {
    const found: Partial<Record<(typeof BAND_SURFACES)[number], Els>> = {}
    fakeRepo(on, { isAdopted: false })
    on('ui.render', ($, e) => {
      if (e.surface === 'terminal' || e.surface === 'desktop') found[e.surface] = $.ui.resolve(e)
      return $.ui.resolve(e).Box({ key: 'engine' })
    })
    for (const surface of BAND_SURFACES) await (await $.ui.mount({ ...BAND, surface })).unmount()
    if (!found.terminal || !found.desktop) throw new Error('no element table')
    return { terminal: found.terminal, desktop: found.desktop }
  }

  test('draws the Text form when building the Raster throws', async ($, on) => {
    const { terminal } = await tables($, on)
    const broken = { ...terminal, Raster: () => { throw new Error('refused') } } as unknown as Els
    const row = stepperRow(broken, input) as unknown as Node
    expect(row.type).toBe('Box')
    expect(textForm(row).text).toBe('✓ context ━ ✓ size ━ ✓ repro ━ ● investigate ━ ○ decide ━ ○ fix ━ ○ review ━ ○ retro')
    expect((stepperRow(terminal, input) as unknown as Node).type).toBe('Raster')
  })

  test("draws the Text form where the table's Raster draws nothing", async ($, on) => {
    // Off the terminal the engine's table still has a `Raster`: it builds an empty box.
    const { desktop } = await tables($, on)
    expect('Raster' in desktop).toBe(true)
    const row = stepperRow(desktop, input) as unknown as Node
    expect(row.props).toEqual({ key: 'laa-steps' })
    expect(textForm(row).texts).toHaveLength(3)
  })

  test('tints the Raster by the theme: gray around the current step, the gate tint on a ★ step', async ($, on) => {
    const { terminal } = await tables($, on)
    const before = '✓ context ━ ✓ size ━ ✓ repro ━ '.length
    const here = '● investigate'.length
    const running = cellsOf(stepperRow(terminal, { ...input, theme: 'dark' }) as unknown as Node)
    expect(running.fg).toEqual([
      ...Array(before).fill(DARK.muted), ...Array(here).fill(DEFAULT_FG), ...Array(running.text.length - before - here).fill(DARK.muted),
    ])
    expect(new Set(running.bg)).toEqual(new Set([DEFAULT_FG]))
    const gate = cellsOf(stepperRow(terminal, { ...input, run: { ...input.run, gate: 'Go on?' }, theme: 'light' }) as unknown as Node)
    expect(gate.fg.slice(before, before + here)).toEqual(Array(here).fill(paletteOf('light').gate))
    expect(new Set(gate.fg)).toEqual(new Set([paletteOf('light').muted, paletteOf('light').gate]))
  })

  test('answers null where there is no second row to draw', async ($, on) => {
    const { terminal, desktop } = await tables($, on)
    for (const els of [terminal, desktop]) {
      expect(stepperRow(els, { ...input, run: null })).toBeNull()
      expect(stepperRow(els, { ...input, maxRows: 1 })).toBeNull()
      expect(stepperRow(els, { ...input, columns: 11 })).toBeNull()
      expect(stepperRow(els, { ...input, run: { ...input.run, skill: 'retro', step: null } })).toBeNull()
      expect(stepperRow(els, { ...input, run: { ...input.run, step: { n: 3, last: 9, title: 'Investigate' } } })).toBeNull()
      expect(stepperRow(els, { ...input, columns: 12 })).not.toBeNull()
    }
  })
})

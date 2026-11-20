// Pure: the stepper, the band's second row, which shows every step of the running (or paused) skill and
// where the run stands.

import type { RenderElement } from 'claude-code'

import type { Journal, Run } from '../types'
import { C, isBuilt, paletteOf, rasterOf, wordsOf } from './draw'
import type { Els, Span } from './draw'
import { STEPS, tableFor } from './tables'

// What the stepper is drawn from, all of it read by register.tsx.
export type StepperInput = {
  // The run in progress, or null; a run wins over a paused journal.
  run: Run | null
  // The journal of a pipeline that stopped on this branch, or null.
  paused: Journal | null
  // The band's `bodyColumns` and `maxRows`.
  columns: number
  maxRows: number
  // The person's theme by name, for `paletteOf`; null when unread.
  theme: string | null
}

// How one step is marked: ✓ done, a dim label with no glyph for one the run skipped, ● the step running,
// ★ the step a gate waits at, ○ the step a paused run stopped at and every step still to come.
export type Mark = 'done' | 'skipped' | 'current' | 'gate' | 'paused' | 'todo'

// The steps of the run's skill with their marks, and which one the run stands at.
export type Stepper = {
  steps: readonly { label: string; mark: Mark }[]
  // The place in `steps` of the step the run stands at; null while no step is known (every step is `todo`).
  at: number | null
  // That step as its line printed it (`3`, `7`), for the narrowest forms; null with `at`.
  n: number | null
  last: number | null
}

// The steps and their marks, or null when there is nothing to draw: no run and no paused journal, no table
// fits (`tableFor`; a table other than the skill's own only for resume), or the step printed is not one of the
// table's. For a step `n` before the current step `c`:
// done when the run was joined mid-way (`seen` absent), when `n` is in `seen`, or when `n` is below the lowest
// step seen; skipped otherwise. A paused journal keeps no history: every step before its own is done.
export const stepperOf = ({ run, paused }: Pick<StepperInput, 'run' | 'paused'>): Stepper | null => {
  const source = run ?? paused
  if (!source) return null
  const table = tableFor(source.skill, source.step)
  const isOwn = table === STEPS[source.skill]
  // Only /laa:resume walks another skill's steps: any other skill printing them is off its contract.
  if (!table || (!isOwn && source.skill !== 'resume')) return null
  const labels = table.steps.map(s => s.label)
  const step = source.step
  if (!step) return { steps: labels.map(label => ({ label, mark: 'todo' as const })), at: null, n: null, last: null }
  const at = step.n - table.first
  if (!Number.isInteger(at) || at < 0 || at >= labels.length) return null
  // The steps a resume run saw are numbered in its own table, not in the one it now walks: no history.
  const seen = isOwn ? run?.seen : undefined
  const lowest = seen ? Math.min(...seen) : 0
  const isDone = (n: number) => !seen || seen.includes(n) || n < lowest
  const here: Mark = source.gate ? 'gate' : run ? 'current' : 'paused'
  const markOf = (i: number): Mark => (i > at ? 'todo' : i === at ? here : isDone(table.first + i) ? 'done' : 'skipped')
  return { steps: labels.map((label, i) => ({ label, mark: markOf(i) })), at, n: step.n, last: step.last }
}

const MIN_COLUMNS = 12
const MAX_COLUMNS = 512

// Each mark's glyph; a skipped step has none.
const GLYPH: Record<Mark, string> = { done: '✓', skipped: '', current: '●', gate: '★', paused: '○', todo: '○' }

// A stretch of the row in one tone: `here` is the current step, `gate` the current step while a gate waits
// at it, `dim` everything else. A row has at most one stretch that is not dim.
type Tone = 'dim' | 'here' | 'gate'
type Part = { text: string; tone: Tone }

const widthOf = (parts: readonly Part[]) => parts.reduce((sum, p) => sum + p.text.length, 0)

// One item per step joined by `sep`, as three stretches: the steps before the current one, it, the steps after.
const joined = (stepper: Stepper, items: readonly string[], sep: string): Part[] => {
  const at = stepper.at
  if (at === null) return [{ text: items.join(sep), tone: 'dim' }]
  const parts: Part[] = [
    { text: items.slice(0, at).map(item => item + sep).join(''), tone: 'dim' },
    { text: items[at] ?? '', tone: stepper.steps[at]?.mark === 'gate' ? 'gate' : 'here' },
    { text: items.slice(at + 1).map(item => sep + item).join(''), tone: 'dim' },
  ]
  return parts.filter(p => p.text !== '')
}

// The row cut to `columns` characters.
const cut = (parts: readonly Part[], columns: number): Part[] => {
  let room = columns
  const out: Part[] = []
  for (const p of parts) {
    if (room <= 0) break
    out.push({ ...p, text: p.text.slice(0, room) })
    room -= p.text.length
  }
  return out
}

// The row at the widest form that fits `columns` (at most 512), or null under 12 columns. In the forms that
// label only the current step, a skipped step is a `·`, so every step keeps its place in the row.
const partsOf = (stepper: Stepper, columns: number): Part[] | null => {
  if (!(columns >= MIN_COLUMNS)) return null
  const room = Math.min(Math.floor(columns), MAX_COLUMNS)
  const { steps, at } = stepper
  const full = steps.map(s => (GLYPH[s.mark] ? `${GLYPH[s.mark]} ${s.label}` : s.label))
  const short = steps.map((s, i) => (i === at ? `${GLYPH[s.mark]} ${s.label}` : GLYPH[s.mark] || '·'))
  const forms = [joined(stepper, full, ' ━ '), joined(stepper, full, ' '), joined(stepper, short, ' ')]
  const current = at === null ? undefined : steps[at]
  if (current) {
    const text = `${GLYPH[current.mark]} ${stepper.n}/${stepper.last} ${current.label}`
    forms.push([{ text, tone: current.mark === 'gate' ? 'gate' : 'here' }])
  }
  return forms.find(form => widthOf(form) <= room) ?? cut(forms[forms.length - 1] ?? [], room)
}

// The stretches as Raster spans: the current step without a color (the terminal's own), the rest in the palette's.
const spansOf = (parts: readonly Part[], palette: { muted: number; gate: number }): Span[] =>
  parts.map(p => (p.tone === 'here' ? { text: p.text } : { text: p.text, fg: p.tone === 'gate' ? palette.gate : palette.muted }))

// The row's text as spans, at the widest form that fits `columns` (at most 512): full labels joined by
// ` ━ `; single spaces between them; only the current step labelled (`✓ ✓ ● investigate ○ ○`); `● 3/7 investigate`;
// that cut to fit. Only printable ASCII and GLYPHS, so `rasterOf` takes it. null under 12 columns. The current
// step is in the terminal's own color (the palette's `gate` at a ★), every other step in the palette's `muted`.
export const layoutStepper = (stepper: Stepper, columns: number, palette: { muted: number; gate: number }): Span[] | null => {
  const parts = partsOf(stepper, columns)
  return parts && spansOf(parts, palette)
}

// The band's second row, keyed `laa-steps`: on the terminal one `<Raster>` (only when `rasterOf` takes the
// cells and what the table builds is a Raster, by `isBuilt`; a throw while building it draws the Text
// form), elsewhere a `<Box>` of dim Text around the current step. Returns null for "no second row", and
// register.tsx draws the 0.3.0 band alone: no run and no paused journal, `maxRows` under 2, no table fits, or
// under 12 columns. When it returns a row, register.tsx draws
// `<Box key="laa-band" flexDirection="column">{the 0.3.0 row}{this row}</Box>`.
export const stepperRow = (els: Els, input: StepperInput): RenderElement | null => {
  if (!(input.maxRows >= 2)) return null
  const stepper = stepperOf(input)
  const parts = stepper && partsOf(stepper, input.columns)
  if (!parts) return null
  if ('Raster' in els) {
    try {
      const { Raster } = els
      const words = wordsOf(spansOf(parts, paletteOf(input.theme)))
      const raster = rasterOf(words.length / 3, 1, words)
      const drawn: RenderElement | null = raster && <Raster key="laa-steps" columns={raster.columns} rows={raster.rows} cells={raster.cells} />
      // Off the terminal the table still carries a `Raster`, one that draws nothing: only a real one is kept.
      if (isBuilt(drawn, 'Raster')) return drawn
    } catch {
      // The Text form below draws instead.
    }
  }
  const { Box, Text } = els
  return (
    <Box key="laa-steps">
      {parts.map((p, i) => (p.tone === 'dim'
        ? <Text key={`part${i}`} dimColor>{p.text}</Text>
        : p.tone === 'gate'
          ? <Text key={`part${i}`} color={C.gate}>{p.text}</Text>
          : <Text key={`part${i}`}>{p.text}</Text>))}
    </Box>
  )
}

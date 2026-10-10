// Pure: the stepper, the band's second row, which shows every step of the running (or paused) skill and
// where the run stands. STUBS: slice A writes the bodies; the signatures are final.

import type { RenderElement } from 'claude-code'

import type { Journal, Run } from '../types'
import type { Els, Span } from './draw'

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

// STUB. The steps and their marks, or null when there is nothing to draw: no run and no paused journal, or
// no table fits (`tableFor`). For a step `n` before the current step `c`: done when the run was joined mid-way
// (`seen` absent), when `n` is in `seen`, or when `n` is below the lowest step seen; skipped otherwise.
export const stepperOf = (_input: Pick<StepperInput, 'run' | 'paused'>): Stepper | null => null

// STUB. The row's text as spans, at the widest form that fits `columns` (at most 512): full labels joined by
// ` ━ `; single spaces between them; only the current step labelled (`✓ ✓ ● investigate ○ ○`); `● 3/7 investigate`;
// that cut to fit. Only printable ASCII and GLYPHS, so `rasterOf` takes it. null under 12 columns. The current
// step is in the terminal's own color (the palette's `gate` at a ★), every other step in the palette's `muted`.
export const layoutStepper = (_stepper: Stepper, _columns: number, _palette: { muted: number; gate: number }): Span[] | null => null

// STUB. The band's second row, keyed `laa-steps`: on the terminal one `<Raster>` (only when `'Raster' in els`
// and `rasterOf` takes the cells; a throw while building it draws the Text form), elsewhere a `<Box>` of dim
// Text around the current step. Returns null for "no second row", and register.tsx draws the 0.3.0 band alone:
// no run and no paused journal, `maxRows` under 2, no table fits, or under 12 columns. When it returns a row,
// register.tsx draws `<Box key="laa-band" flexDirection="column">{the 0.3.0 row}{this row}</Box>`.
export const stepperRow = (_els: Els, _input: StepperInput): RenderElement | null => null

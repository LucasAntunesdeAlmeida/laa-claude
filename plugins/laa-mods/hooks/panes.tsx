// Pure: the full-mode findings and learnings panes, and the helpers that turn a finding's location into a
// link and a snippet. register.tsx reads the files and the state, and builds every handler passed in here.

import type { RenderElement } from 'claude-code'

import type { Finding, Findings, Learning, Learnings } from '../types'
import type { Els } from './draw'
import { slash } from './git'

const MAX_HREF = 2048
const MAX_LINE = 200
const AROUND = 2

// A finding's location as a file and a line: `src/a.go:14` (also `:14-20` and `:14:3`, which name line 14).
// `line` is null when the location names none.
export const locationOf = (location: string): { file: string; line: number | null } => {
  const m = /^(.+?):(\d+)(?:[-:,]\d+)*$/.exec(location.trim())
  return m ? { file: m[1] ?? '', line: Number(m[2]) } : { file: location.trim(), line: null }
}

// The lines of a file around `line` (two either side), safe to draw: no `\r`, any other control character
// but a tab as `?`, each line cut at 200 characters. null when the file is binary (holds a NUL) or has no such line.
export const snippetOf = (text: string, line: number): { source: string; startLine: number } | null => {
  if (text.includes('\u0000')) return null
  const lines = text.split('\n')
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return null
  const startLine = Math.max(1, line - AROUND)
  const source = lines
    .slice(startLine - 1, line + AROUND)
    .map(l => l.replace(/\r/g, '').replace(/[\u0001-\u0008\u000b-\u001f\u007f-\u009f]/g, '?').slice(0, MAX_LINE))
    .join('\n')
  return { source, startLine }
}

// The `file:` address of an absolute path, each segment encoded; null when it is not absolute or runs past
// the 2,048 characters a Link's address may have (a longer one refuses the whole tree).
export const fileHref = (path: string): string | null => {
  const p = slash(path)
  const drive = /^[a-zA-Z]:\//.exec(p)?.[0] ?? ''
  if (!drive && !p.startsWith('/')) return null
  const rest = p.slice(drive ? drive.length : 1).split('/').map(encodeURIComponent).join('/')
  const href = `file:///${drive}${rest}`
  return href.length <= MAX_HREF ? href : null
}

// What the findings pane is drawn from.
export type FindingsInput = {
  // The loaded review; register.tsx draws the "not loaded" line itself.
  list: Findings
  // `all`, `high` (CRIT and HIGH), `med`, or `low`; anything else counts as `all`.
  filter: string
  // The pane's `bodyColumns`.
  columns: number
}

// What the findings pane's controls do; each is one of register.tsx's own handlers.
export type FindingsActs = {
  onFix: (chosen: readonly Finding[]) => unknown
  onDismiss: (finding: Finding) => unknown
  onFilter: (value: string) => unknown
}

// What the learnings pane is drawn from.
export type LearningsInput = {
  list: Learnings
  // `all`, `local`, or `generic`; anything else counts as `all`.
  filter: string
  columns: number
}

export type LearningsActs = {
  onReject: (entry: Learning) => unknown
  onEvolve: () => unknown
  onFilter: (value: string) => unknown
}

// STUB (slice D draws it). The findings pane, top to bottom: the repo (dim); on the terminal a Raster bar by
// severity (█ CRIT ▓ HIGH ▒ MED ░ LOW, `barOf` then `rasterOf`, at most 40 cells and `columns - 2`); on every
// surface the legend as Text; `<Select key="severity">` (all, CRIT+HIGH, MED, LOW → `onFilter`) when there are
// more than 3 findings and `'Select' in els`; then each finding the filter shows: its tag (bold, `warning` for
// CRIT and HIGH, never `error`), a Link to the file (`fileHref`; dim Text when it is null) labelled with the
// location, the title, `<Code>` from `list.snippets[f.index]` when there is one, `→ fix`, and the Buttons
// `fix{index}` and `dismiss{index}`; last, `fixHigh` (hotkey f) over every CRIT and HIGH finding, filtered out or not.
// The keys `finding{index}`, `fix{index}`, `dismiss{index}`, and `fixHigh` are 0.3.0's and stay.
// Returns null to draw the 0.3.0 pane, which register.tsx keeps verbatim.
export const findingsPane = (_els: Els, _input: FindingsInput, _acts: FindingsActs): RenderElement | null => null

// STUB (slice D draws it). The learnings pane: the repo (dim); on the terminal a Raster bar by scope (▓ local,
// ░ generic) and on every surface its legend; `<Select key="scope">` (all, local, generic → `onFilter`) under the
// same conditions as the findings pane's; then each learning the filter shows, as 0.3.0 draws it, with its
// `reject{index}` Button; last, `evolve` (hotkey e). Returns null to draw the 0.3.0 pane.
export const learningsPane = (_els: Els, _input: LearningsInput, _acts: LearningsActs): RenderElement | null => null

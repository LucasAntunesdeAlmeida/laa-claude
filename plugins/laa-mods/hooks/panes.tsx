// Pure: the full-mode findings and learnings panes, and the helpers that turn a finding's location into a
// link and a snippet. register.tsx reads the files and the state, and builds every handler passed in here.

import type { RenderElement } from 'claude-code'

import type { Finding, Findings, Learning, Learnings } from '../types'
import { barOf, C, isBuilt, rasterOf, sanitize, wordsOf } from './draw'
import type { Els, Surface } from './draw'
import { isInGit, isUnder, resolveFrom, slash } from './git'

const MAX_HREF = 2048
const MAX_LINE = 200
const AROUND = 2
// The widest a pane's bar is drawn, and how many entries a pane holds before it offers a filter.
const MAX_BAR = 40
const MIN_TO_FILTER = 3

// The shade each severity and each scope is drawn in, darkest first.
const SEVERITIES = [
  { name: 'CRIT', glyph: '█' },
  { name: 'HIGH', glyph: '▓' },
  { name: 'MED', glyph: '▒' },
  { name: 'LOW', glyph: '░' },
] as const
const SCOPES = [
  { name: 'local', glyph: '▓' },
  { name: 'other', glyph: '▒' },
  { name: 'generic', glyph: '░' },
] as const

// What each pane's Select offers, by the value its filter is kept under.
const SEVERITY_OPTIONS = [
  { value: 'all', label: 'all' },
  { value: 'high', label: 'CRIT+HIGH' },
  { value: 'med', label: 'MED' },
  { value: 'low', label: 'LOW' },
] as const
const SCOPE_OPTIONS = [
  { value: 'all', label: 'all' },
  { value: 'local', label: 'local' },
  { value: 'other', label: 'other' },
  { value: 'generic', label: 'generic' },
] as const

const isDigit = (code: number) => code >= 48 && code <= 57

// A finding's location as a file and a line: `src/a.go:14` (also `:14-20` and `:14:3`, which name line 14).
// `line` is null when the location names none.
// Read from the end, one pass: the location is the review's own text, as long and as odd as it likes, and
// this runs on every draw. Walking back over the `:14`, `-20`, `,3` groups that end it, the file stops at
// the first `:` of that run (never at the location's own first character).
export const locationOf = (location: string): { file: string; line: number | null } => {
  const text = location.trim()
  let colon = -1
  let end = text.length
  while (end > 0) {
    let start = end
    while (start > 0 && isDigit(text.charCodeAt(start - 1))) start -= 1
    const sep = text.charAt(start - 1)
    if (start === end || start < 2 || (sep !== ':' && sep !== '-' && sep !== ',')) break
    if (sep === ':') colon = start - 1
    end = start - 1
  }
  if (colon < 0) return { file: text, line: null }
  return { file: text.slice(0, colon), line: Number(/^\d+/.exec(text.slice(colon + 1))?.[0]) }
}

// The lines of a file around one line of it, and the number of the first of them.
export type Cut = { source: string; startLine: number }

// The lines of a file around each of `wanted` (two either side), by the line asked for, safe to draw: no `\r`,
// any other control character but a tab as `?`, each line cut at 200 characters. null for every line when the
// file is binary (holds a NUL), and for a line the file does not have. A byte order mark is no part of the
// first line, and the line break that ends the file starts no line after it. The file is checked and split
// once, however many lines are asked for.
export const snippetsOf = (text: string, wanted: readonly number[]): Map<number, Cut | null> => {
  const lines = text.includes('\u0000') ? null : text.replace(/^\ufeff/, '').split('\n')
  if (lines && lines.length > 1 && lines.at(-1) === '') lines.pop()
  const cuts = new Map<number, Cut | null>()
  for (const line of wanted) {
    if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
      cuts.set(line, null)
      continue
    }
    const startLine = Math.max(1, line - AROUND)
    const source = lines
      .slice(startLine - 1, line + AROUND)
      .map(l => l.replace(/\r/g, '').replace(/[\u0001-\u0008\u000b-\u001f\u007f-\u009f]/g, '?').slice(0, MAX_LINE))
      .join('\n')
    cuts.set(line, { source, startLine })
  }
  return cuts
}

// The lines around one `line` of a file, as `snippetsOf` cuts them.
export const snippetOf = (text: string, line: number): Cut | null => snippetsOf(text, [line]).get(line) ?? null

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

// File types that get no `file:` link. A terminal hands the address to the system's opener, and the opener
// runs these (a script, a program, a shortcut) where it would show any other file: a click on a finding
// must never run what the review, or the branch under review, put there.
const RUNNABLE = new Set([
  'cmd', 'bat', 'com', 'exe', 'lnk', 'hta', 'scr', 'msi', 'msc', 'cpl', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'py', 'pyw',
  'sh', 'command', 'app', 'jar',
])

// The `file:` address a finding's location is linked to, or null where it is named in text instead: a file
// outside the repo, one of git's own (`.git` in any case), one of a type the opener would run, or a path
// `fileHref` gives no address for. Checked on the path's spelling: nothing is read to draw a link.
export const linkOf = (repo: string, location: string): string | null => {
  const path = resolveFrom(repo, locationOf(location).file)
  if (!isUnder(path, repo) || isInGit(path, repo)) return null
  // Windows opens `setup.cmd.` and `setup.cmd ` as `setup.cmd`.
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/[. ]+$/, '')
  const type = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return RUNNABLE.has(type) ? null : fileHref(path)
}

// What the findings pane is drawn from.
export type FindingsInput = {
  // The loaded review; register.tsx draws the "not loaded" line itself.
  list: Findings
  // `all`, `high` (CRIT and HIGH), `med`, or `low`; anything else counts as `all`.
  filter: string
  // The pane's `bodyColumns`.
  columns: number
  // Where the pane is drawn (`e.surface`): only the terminal opens a `file:` link.
  surface: Surface
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
  // `all`, `local`, `generic`, or `other` (offered only when a learning names neither); anything else counts as `all`.
  filter: string
  columns: number
}

export type LearningsActs = {
  onReject: (entry: Learning) => unknown
  onEvolve: () => unknown
  onFilter: (value: string) => unknown
}

// One stretch of a bar: its shade, what it counts, and how many.
type Part = { glyph: string; name: string; count: number }

const isHigh = (f: Finding) => f.tag === 'CRIT' || f.tag === 'HIGH'

// Whether a finding is shown under a severity filter; `all` shows every one.
const isShownFinding = (f: Finding, filter: string) =>
  filter === 'high' ? isHigh(f) : filter === 'med' ? f.tag === 'MED' : filter === 'low' ? f.tag === 'LOW' : true

// A learning's scope as the pane counts and filters it: `local` or `generic` by the scope's leading word,
// whatever its case or what follows it (`Local`, `generic (upstream)`); anything else, none included, is `other`.
const scopeOf = (entry: Learning) => {
  const word = /^[a-z]+/.exec(String(entry.scope ?? '').trim().toLowerCase())?.[0]
  return word === 'local' || word === 'generic' ? word : 'other'
}

// A filter as one of the values its Select offers; anything else counts as `all`.
const filterOf = (options: readonly { value: string }[], filter: string) =>
  options.some(o => o.value === filter) ? filter : 'all'

// How many entries each shade of a bar counts, by the name `nameOf` reads off an entry.
const partsOf = <T,>(shades: readonly { name: string; glyph: string }[], entries: readonly T[], nameOf: (entry: T) => string): Part[] =>
  shades.map(s => ({ glyph: s.glyph, name: s.name, count: entries.filter(entry => nameOf(entry) === s.name).length }))

// A bar's legend, every part named with its count: `█ CRIT 0 · ▓ HIGH 1 · ▒ MED 1 · ░ LOW 0`.
const legendOf = (parts: readonly Part[]) => parts.map(p => `${p.glyph} ${p.name} ${p.count}`).join(' · ')

// The parts as one Raster row in the terminal's own color, at most 40 cells and two short of the pane's
// width. null where the surface draws no Raster, nothing counts, there is no room, or `rasterOf` refuses
// the cells: the legend under it says the same in Text.
const barRow = (els: Els, key: string, parts: readonly Part[], columns: number): RenderElement | null => {
  if (!('Raster' in els) || !Number.isFinite(columns)) return null
  const bar = barOf(parts, Math.min(Math.floor(columns) - 2, MAX_BAR))
  const raster = bar ? rasterOf([...bar].length, 1, wordsOf([{ text: bar }])) : null
  if (!raster) return null
  try {
    const { Raster } = els
    const row = <Raster key={key} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
    return isBuilt(row, 'Raster') ? row : null
  } catch {
    // The bar is an extra: the legend and the rest of the pane still draw.
    return null
  }
}

// A pane's filter as a Select, or null where there is none to offer: three entries or fewer, or a surface
// that draws no Select (mobile, whose table builds an empty Box for one). Where it is null the pane shows every entry, whatever the filter was left at.
const filterRow = (
  els: Els,
  key: string,
  options: readonly { value: string; label: string }[],
  value: string,
  count: number,
  onFilter: (value: string) => unknown,
): RenderElement | null => {
  if (count <= MIN_TO_FILTER || !('Select' in els)) return null
  const { Select } = els
  const row = <Select key={key} label="Show" options={options} value={value} onSelect={picked => void onFilter(picked)} />
  return isBuilt(row, 'Select') ? row : null
}

// The findings pane under `visuals: full`, top to bottom: the repo (dim); on the terminal a Raster bar by
// severity (█ CRIT ▓ HIGH ▒ MED ░ LOW); on every surface its legend as Text; `<Select key="severity">` when
// there are more than 3 findings and the surface draws a Select; then each finding the filter shows: its tag
// (bold, `warning` for CRIT and HIGH, never `error`), its location (on the terminal a Link to the file; dim
// Text, as 0.3.0 drew it, on the other surfaces, which open no `file:` address, and when `linkOf` gives
// none), the title, the code around it when `list.snippets` holds it, `→ fix`,
// and the Buttons `fix{index}` and `dismiss{index}`; last, `fixHigh` (hotkey f) over every CRIT and HIGH
// finding, filtered out or not. The keys are 0.3.0's. Returns null to draw the 0.3.0 pane, which
// register.tsx keeps verbatim.
export const findingsPane = (els: Els, input: FindingsInput, acts: FindingsActs): RenderElement | null => {
  const { list } = input
  if (!list || typeof list.repo !== 'string' || !Array.isArray(list.entries)) return null
  const { Box, Button, Code, Link, Text } = els
  if (!Box || !Button || !Code || !Link || !Text) return null
  const entries = list.entries
  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{list.repo}</Text>
        <Text>No open findings. Nothing to fix.</Text>
      </Box>
    )
  }
  const parts = partsOf(SEVERITIES, entries, f => f.tag)
  const filter = filterOf(SEVERITY_OPTIONS, input.filter)
  const select = filterRow(els, 'severity', SEVERITY_OPTIONS, filter, entries.length, acts.onFilter)
  const shown = select ? entries.filter(f => isShownFinding(f, filter)) : entries
  const high = entries.filter(isHigh)
  return (
    <Box flexDirection="column">
      <Text dimColor>{list.repo}</Text>
      {barRow(els, 'severity-bar', parts, input.columns)}
      <Text dimColor>{legendOf(parts)}</Text>
      {select}
      {shown.length === 0 && <Text dimColor>No open findings match this filter.</Text>}
      {shown.map(f => {
        const href = input.surface === 'terminal' ? linkOf(list.repo, f.location) : null
        const snippet = list.snippets?.[f.index]
        // The review's own text is drawn without its control characters: one of them refuses the whole pane.
        const location = sanitize(f.location)
        const fix = sanitize(f.fix)
        return (
          <Box key={`finding${f.index}`} flexDirection="column" marginTop={1}>
            <Box>
              <Text bold color={isHigh(f) ? C.warning : undefined}>{`${f.tag.padEnd(4)}  `}</Text>
              {href ? <Link href={href} label={location} /> : <Text dimColor>{location}</Text>}
            </Box>
            <Text>{sanitize(f.title)}</Text>
            {snippet && <Code source={snippet.source} startLine={snippet.startLine} path={snippet.path} wrap="truncate-end" />}
            {fix && <Text color={C.action}>→ {fix}</Text>}
            <Box>
              <Button key={`fix${f.index}`} label="Fix" onPress={() => acts.onFix([f])} />
              <Button key={`dismiss${f.index}`} label="Dismiss" onPress={() => acts.onDismiss(f)} />
            </Box>
          </Box>
        )
      })}
      {high.length > 0 && (
        <Box marginTop={1}>
          <Button key="fixHigh" label={`Fix all CRIT and HIGH (${high.length})`} variant="primary" hotkey="f" onPress={() => acts.onFix(high)} />
        </Box>
      )}
    </Box>
  )
}

// The learnings pane under `visuals: full`: the repo (dim); on the terminal a Raster bar by scope (▓ local,
// ░ generic, and ▒ other between them when a learning names neither) and on every surface its legend; `<Select key="scope">` under the same conditions as the
// findings pane's; then each learning the filter shows, as 0.3.0 draws it, with its `reject{index}` Button;
// last, `evolve` (hotkey e). Returns null to draw the 0.3.0 pane.
export const learningsPane = (els: Els, input: LearningsInput, acts: LearningsActs): RenderElement | null => {
  const { list } = input
  if (!list || typeof list.repo !== 'string' || !Array.isArray(list.entries)) return null
  const { Box, Button, Text } = els
  if (!Box || !Button || !Text) return null
  const entries = list.entries
  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{list.repo}</Text>
        <Text>No open learnings. Nothing to evolve.</Text>
      </Box>
    )
  }
  // `other` is counted, named, and offered only when some learning falls there.
  const hasOther = entries.some(entry => scopeOf(entry) === 'other')
  const parts = partsOf(SCOPES, entries, scopeOf).filter(p => p.name !== 'other' || hasOther)
  const options = SCOPE_OPTIONS.filter(o => o.value !== 'other' || hasOther)
  const filter = filterOf(options, input.filter)
  const select = filterRow(els, 'scope', options, filter, entries.length, acts.onFilter)
  const shown = select && filter !== 'all' ? entries.filter(entry => scopeOf(entry) === filter) : entries
  return (
    <Box flexDirection="column">
      <Text dimColor>{list.repo}</Text>
      {barRow(els, 'scope-bar', parts, input.columns)}
      <Text dimColor>{legendOf(parts)}</Text>
      {select}
      {shown.length === 0 && <Text dimColor>No open learnings match this filter.</Text>}
      {shown.map(entry => (
        <Box key={`entry${entry.index}`} flexDirection="column" marginTop={1}>
          <Text bold>{sanitize(entry.title)}</Text>
          <Text dimColor>{sanitize(entry.scope)} · {sanitize(entry.kind)} · {sanitize(entry.target)}</Text>
          <Text>{sanitize(entry.signal)}</Text>
          <Text color={C.action}>→ {sanitize(entry.proposal)}</Text>
          <Button key={`reject${entry.index}`} label="Reject" onPress={() => acts.onReject(entry)} />
        </Box>
      ))}
      <Box marginTop={1}>
        <Button key="evolve" label="Evolve with /laa:evolve" variant="primary" hotkey="e" onPress={() => acts.onEvolve()} />
      </Box>
    </Box>
  )
}

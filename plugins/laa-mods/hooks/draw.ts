// Pure drawing helpers: the theme's colors, the glyphs laa draws with, and the one place a Raster's cells
// are checked and packed. Nothing here calls the engine.

import type { Elements, RenderElement } from 'claude-code'

// The element table of whichever surface a hook draws on, as `$.ui.resolve(e)` answers it: what the
// pure drawing files take as `els`. `'Raster' in els` does not say the surface draws one (see `isBuilt`).
export type Els = Elements[keyof Elements]

// Where a hook draws, as its `e.surface` names it.
export type Surface = keyof Elements

// Whether a surface's table built the element asked of it. Every surface's table holds every constructor;
// one the surface does not draw answers an empty Box in its place, so `'Raster' in els` or `'Select' in els`
// alone says nothing: a Raster or a Select is built, then kept only when this says it is one.
export const isBuilt = (el: RenderElement | null, type: string) => (el as { type?: unknown } | null)?.type === type

// The theme's semantic colors, so laa's marks follow the person's theme, colorblind themes included.
export const C = { danger: 'error', warning: 'warning', action: 'suggestion', gate: 'permission', success: 'success' } as const

// Every glyph laa draws outside ASCII: each one cell wide, which is what a Raster takes.
export const GLYPHS = '✓✗●○★▸━·█▓▒░'

// A Raster color that means "the terminal's own": bit 24 alone.
export const DEFAULT_FG = 0x01000000

const MAX_COLUMNS = 512
const MAX_ROWS = 256

// The two colors a Raster needs beside the terminal's own, picked by the theme's name. A Raster takes RGB,
// not theme keys, so only the stock dark and light themes get a gray and a gate tint; an ANSI, custom,
// unknown, or unread theme draws in the terminal's own color and lets the glyphs carry the meaning.
export const paletteOf = (theme: string | null): { muted: number; gate: number } => {
  const name = (theme ?? '').toLowerCase()
  if (name.endsWith('-ansi')) return { muted: DEFAULT_FG, gate: DEFAULT_FG }
  if (name.startsWith('dark')) return { muted: 0x808080, gate: 0xb1b9f9 }
  if (name.startsWith('light')) return { muted: 0x808080, gate: 0x5769f7 }
  return { muted: DEFAULT_FG, gate: DEFAULT_FG }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard padded base64 without the engine's help, built a chunk at a time so a wide bar costs no long `+=` chain.
export const toBase64Pure = (bytes: Uint8Array): string => {
  const chunks: string[] = []
  for (let at = 0; at < bytes.length; at += 3072) {
    const end = Math.min(at + 3072, bytes.length)
    const part: string[] = []
    for (let i = at; i < end; i += 3) {
      const a = bytes[i] ?? 0
      const b = bytes[i + 1] ?? 0
      const c = bytes[i + 2] ?? 0
      part.push(
        B64.charAt(a >> 2) +
          B64.charAt(((a & 3) << 4) | (b >> 4)) +
          (i + 1 < end ? B64.charAt(((b & 15) << 2) | (c >> 6)) : '=') +
          (i + 2 < end ? B64.charAt(c & 63) : '='),
      )
    }
    chunks.push(part.join(''))
  }
  return chunks.join('')
}

// The words as bytes, each a little-endian u32 whatever the machine's own byte order.
export const bytesOf = (words: readonly number[]): Uint8Array => {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, true))
  return bytes
}

// A Raster's `cells`: the words packed and base64-encoded, by the engine's own encoder where it has one.
export const encodeCells = (words: readonly number[]): string => {
  const bytes = bytesOf(words)
  const native = (bytes as { toBase64?: unknown }).toBase64
  return typeof native === 'function' ? String(native.call(bytes)) : toBase64Pure(bytes)
}

// `cells` read back, for tests: the text the cells spell, and each cell's foreground and background.
export const decodeCells = (cells: string): { text: string; fg: number[]; bg: number[] } => {
  const raw = atob(cells)
  const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const out = { text: '', fg: [] as number[], bg: [] as number[] }
  for (let at = 0; at + 12 <= bytes.length; at += 12) {
    out.text += String.fromCodePoint(view.getUint32(at, true))
    out.fg.push(view.getUint32(at + 4, true))
    out.bg.push(view.getUint32(at + 8, true))
  }
  return out
}

// A stretch of one-color text in a Raster row; no `fg` means the terminal's own color.
export type Span = { text: string; fg?: number }

// The cells of one row, a `[codePoint, foreground, background]` triplet per character, on the terminal's own background.
export const wordsOf = (spans: readonly Span[]): number[] =>
  spans.flatMap(s => [...s.text].flatMap(ch => [ch.codePointAt(0) ?? 0x20, s.fg ?? DEFAULT_FG, DEFAULT_FG]))

const isColor = (n: number | undefined) => n !== undefined && Number.isInteger(n) && ((n >= 0 && n <= 0xffffff) || n === DEFAULT_FG)
const isGlyph = (n: number | undefined) => n !== undefined && ((n >= 0x20 && n <= 0x7e) || (n <= 0xffff && GLYPHS.includes(String.fromCharCode(n))))

// What a `<Raster>` takes beside its key.
export type RasterSpec = { columns: number; rows: number; cells: string }

// The props of a Raster for `columns × rows` cells, or null when the engine would refuse them: a refused
// tree empties its whole site (the band's first row included), so every Raster laa draws passes through
// here first and the caller draws Text on null. Checked: the size limits, three words per cell, every code
// point printable ASCII or one of GLYPHS, every color RGB or the terminal's own.
export const rasterOf = (columns: number, rows: number, words: readonly number[]): RasterSpec | null => {
  if (!Number.isInteger(columns) || columns < 1 || columns > MAX_COLUMNS) return null
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) return null
  if (words.length !== columns * rows * 3) return null
  for (let i = 0; i < words.length; i += 3) {
    if (!isGlyph(words[i]) || !isColor(words[i + 1]) || !isColor(words[i + 2])) return null
  }
  return { columns, rows, cells: encodeCells(words) }
}

// A stacked bar `width` cells wide: each part's glyph repeated in proportion to its count, every part
// that counts anything getting at least one cell. '' when nothing counts or there is no room for every part.
export const barOf = (parts: readonly { glyph: string; count: number }[], width: number): string => {
  const shown = parts.filter(p => p.count > 0)
  const total = shown.reduce((sum, p) => sum + p.count, 0)
  if (total === 0 || !Number.isInteger(width) || width < shown.length) return ''
  const cells = shown.map(p => Math.max(1, Math.floor((p.count * width) / total)))
  // Rounding leaves a few cells over or short: the widest part takes them, never dropping below one cell.
  let spare = width - cells.reduce((sum, n) => sum + n, 0)
  while (spare !== 0) {
    const widest = cells.indexOf(Math.max(...cells))
    const step = spare > 0 ? 1 : -1
    cells[widest] = (cells[widest] ?? 1) + step
    spare -= step
  }
  return shown.map((p, i) => p.glyph.repeat(cells[i] ?? 0)).join('')
}

// Text from the model or a file, safe to draw: terminal escape sequences and control characters removed,
// line breaks and tabs kept.
export const sanitize = (text: string) =>
  text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')

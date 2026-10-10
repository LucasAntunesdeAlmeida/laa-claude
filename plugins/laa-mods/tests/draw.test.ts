import { describe, expect, test } from 'claude-code/testing'

import {
  barOf, bytesOf, decodeCells, DEFAULT_FG, encodeCells, GLYPHS, paletteOf, rasterOf, sanitize, toBase64Pure, wordsOf,
} from '../hooks/draw'

// One orange full block on the terminal's own background: the cell the Raster's own documentation packs.
const ORANGE_BLOCK = [0x2588, 0xff8800, 0x01000000]

describe('raster cells', () => {
  test('packs little-endian u32 triplets as padded base64', () => {
    expect(encodeCells(ORANGE_BLOCK)).toBe('iCUAAACI/wAAAAAB')
    expect(toBase64Pure(bytesOf(ORANGE_BLOCK))).toBe('iCUAAACI/wAAAAAB')
    expect([...bytesOf([0x01020304])]).toEqual([4, 3, 2, 1])
  })

  test('the pure encoder agrees with the engine on every length, across its chunk boundary too', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 6, 3071, 3072, 3073, 6145]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256)
      const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
      expect(toBase64Pure(bytes), `${length} bytes`).toBe(btoa(binary))
    }
    const words = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 8)
    expect(encodeCells(words)).toBe(toBase64Pure(bytesOf(words)))
  })

  test('reads its own cells back', () => {
    const words = wordsOf([{ text: '✓ size ', fg: 0x808080 }, { text: '● fix' }])
    const raster = rasterOf(12, 1, words)
    expect(raster?.columns).toBe(12)
    const back = decodeCells(raster?.cells ?? '')
    expect(back.text).toBe('✓ size ● fix')
    expect(back.fg).toEqual([...Array(7).fill(0x808080), ...Array(5).fill(DEFAULT_FG)])
    expect(back.bg).toEqual(Array(12).fill(DEFAULT_FG))
  })

  test('takes every glyph laa draws with, and all of printable ASCII', () => {
    const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join('')
    for (const text of [GLYPHS, ascii]) {
      expect(rasterOf([...text].length, 1, wordsOf([{ text }])), text).not.toBeNull()
    }
    expect([...GLYPHS]).toHaveLength(12)
  })

  test('refuses what the engine would refuse, so the caller draws Text instead', () => {
    const cell = wordsOf([{ text: 'a' }])
    const row = (text: string) => wordsOf([{ text }])
    // The size limits.
    expect(rasterOf(0, 1, [])).toBeNull()
    expect(rasterOf(1, 0, [])).toBeNull()
    expect(rasterOf(513, 1, row('a'.repeat(513)))).toBeNull()
    expect(rasterOf(1, 257, row('a'.repeat(257)))).toBeNull()
    expect(rasterOf(1.5, 1, cell)).toBeNull()
    expect(rasterOf(512, 1, row('a'.repeat(512)))).not.toBeNull()
    expect(rasterOf(1, 256, row('a'.repeat(256)))).not.toBeNull()
    // Three words a cell, exactly.
    expect(rasterOf(2, 1, cell)).toBeNull()
    expect(rasterOf(1, 1, [0x61, DEFAULT_FG])).toBeNull()
    expect(rasterOf(1, 1, [...cell, 0])).toBeNull()
    // A code point that is neither printable ASCII nor one of laa's glyphs.
    for (const text of ['\t', '\u001b', '\u007f', 'é', '→', '…', '─', '漢', '😀']) {
      expect(rasterOf(1, 1, [text.codePointAt(0) ?? 0, DEFAULT_FG, DEFAULT_FG]), JSON.stringify(text)).toBeNull()
    }
    // A color that is neither RGB nor the terminal's own.
    for (const color of [0x1000000 + 1, 0x2000000, -1, 0.5, Number.NaN]) {
      expect(rasterOf(1, 1, [0x61, color, DEFAULT_FG]), `fg ${color}`).toBeNull()
      expect(rasterOf(1, 1, [0x61, DEFAULT_FG, color]), `bg ${color}`).toBeNull()
    }
    expect(rasterOf(1, 1, [0x61, 0xffffff, 0])).not.toBeNull()
  })
})

describe('raster palette', () => {
  test('gives the stock dark and light themes a gray and a gate tint', () => {
    expect(paletteOf('dark')).toEqual({ muted: 0x808080, gate: 0xb1b9f9 })
    expect(paletteOf('dark-daltonized')).toEqual({ muted: 0x808080, gate: 0xb1b9f9 })
    expect(paletteOf('light')).toEqual({ muted: 0x808080, gate: 0x5769f7 })
    expect(paletteOf('light-daltonized')).toEqual({ muted: 0x808080, gate: 0x5769f7 })
  })

  test("leaves every other theme in the terminal's own color", () => {
    for (const theme of ['dark-ansi', 'light-ansi', 'solarized', 'custom:mine', '', null]) {
      expect(paletteOf(theme), String(theme)).toEqual({ muted: DEFAULT_FG, gate: DEFAULT_FG })
    }
  })
})

describe('stacked bar', () => {
  test('shares the width in proportion, and gives every part that counts a cell', () => {
    const parts = [{ glyph: '█', count: 1 }, { glyph: '▓', count: 1 }, { glyph: '▒', count: 2 }, { glyph: '░', count: 0 }]
    expect(barOf(parts, 8)).toBe('██▓▓▒▒▒▒')
    expect(barOf([{ glyph: '▓', count: 99 }, { glyph: '░', count: 1 }], 10)).toBe('▓▓▓▓▓▓▓▓▓░')
    expect(barOf([{ glyph: '█', count: 1 }, { glyph: '▓', count: 1 }, { glyph: '▒', count: 1 }], 10)).toHaveLength(10)
    expect(barOf(parts, 3)).toBe('█▓▒')
  })

  test('draws nothing when nothing counts or the parts do not fit', () => {
    expect(barOf([{ glyph: '█', count: 0 }], 10)).toBe('')
    expect(barOf([], 10)).toBe('')
    expect(barOf([{ glyph: '█', count: 1 }, { glyph: '▓', count: 1 }], 1)).toBe('')
    expect(barOf([{ glyph: '█', count: 1 }], 0)).toBe('')
  })
})

describe('sanitize', () => {
  test('drops escape sequences and control characters, and keeps line breaks and tabs', () => {
    expect(sanitize('\u001b[31mred\u001b[0m and \u001b[2Kgone')).toBe('red and gone')
    expect(sanitize('a\u0000b\u0007c\rd\u009be')).toBe('abcde')
    expect(sanitize('one\n\ttwo · ✓')).toBe('one\n\ttwo · ✓')
  })
})

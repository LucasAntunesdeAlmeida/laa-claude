// Pure: which block of an assistant reply is a laa closing report, and the framed card it is drawn as.

import type { RenderElement } from 'claude-code'

import { sanitize } from './draw'
import type { C, Els } from './draw'

// A closing report cut into the parts its card draws. `pre`, `statusRaw`, and `rest` are the block's own
// lines, untouched: joined with line breaks (`pre` left out when it is null) they are the block again.
export type Closing = {
  // Everything above the status line; null when the block opens with it ('' is one empty line above it).
  pre: string | null
  // The status line as written (`**✓ Fixed** · nil address`).
  statusRaw: string
  // The status line as its card draws it, in plain text: the glyph, the title, then the rest of the line,
  // without the `**`, the backticks around inline code, or a link's target (`✓ Fixed · nil address`).
  status: string
  // What tells this report from every other: the status line plus a short hash of what stands under it.
  // It is what register.tsx records and compares, so two runs that end with the same status line stay two
  // reports. Two reports the same to the letter share a key (and so, when both failed, both can draw red).
  key: string
  // True for ✓, false for ✗.
  ok: boolean
  // Everything under the status line, the `**Next**` list included.
  rest: string
  // The Next list alone: the lines under `**Next**`.
  next: string
}

// The color of a report card's frame and status line.
export type Tone = (typeof C)['success' | 'warning' | 'danger']

const STATUS = /^\*\*([✓✗]) ([^*\n]+?)\*\*(.*)$/
const NEXT = /^\*\*Next\*\*\s*$/
const ITEM = /^\s*(?:[-*]|\d+\.)\s+\S/
const CONTINUED = /^\s{2,}\S/

// A short hash of a text (djb2, in base 36): enough to tell two reports under one status line apart.
const hashOf = (text: string) => {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// The most text one drawing may carry; a longer report is left to the engine.
const MAX_DRAWN = 100000
// The most of a status line that is turned into plain text and drawn.
const MAX_STATUS = 2000

// A line of markdown as the plain text a `<Text>` draws: inline code without its backticks, a link as its label.
// The link pattern takes time that grows with the square of a line of `[`, so it is given `MAX_STATUS` characters at most.
const plainOf = (line: string) => line.slice(0, MAX_STATUS).replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')

// The block as a closing report, or null when it is not exactly one: the last `**✓ …**` or `**✗ …**` line,
// a `**Next**` line somewhere under it, then a list (items, their indented continuations, blank lines) that
// runs to the end of the block. A workflow's report (a status line with no Next) and a reply that goes on
// after the list are not closing reports, nor is a block with CRLF line ends (the status line must end
// where its line does). A block over 100,000 characters is never drawn as a card, so it is not read at all.
export const closingOf = (text: string): Closing | null => {
  if (text.length > MAX_DRAWN) return null
  const lines = text.split('\n')
  const s = lines.findLastIndex(l => STATUS.test(l))
  const m = STATUS.exec(lines[s] ?? '')
  if (!m) return null
  const x = lines.findIndex((l, i) => i > s && NEXT.test(l))
  if (x < 0) return null
  const list = lines.slice(x + 1)
  const first = list.findIndex(l => l.trim() !== '')
  if (first < 0 || !ITEM.test(list[first] ?? '')) return null
  if (!list.slice(first + 1).every(l => l.trim() === '' || ITEM.test(l) || CONTINUED.test(l))) return null
  const statusRaw = lines[s] ?? ''
  const rest = lines.slice(s + 1).join('\n')
  return {
    pre: s === 0 ? null : lines.slice(0, s).join('\n'),
    statusRaw,
    status: plainOf(`${m[1]} ${m[2]}${m[3]}`),
    key: `${statusRaw} #${hashOf(rest)}`,
    ok: m[1] === '✓',
    rest,
    next: list.join('\n'),
  }
}

// Whether a closing report is laa's: this session recorded its key when a laa run ended with it,
// or (after a resume or a /clear, when nothing is recorded) its Next list names a laa command.
export const isLaaClosing = (c: Closing, closings: readonly string[]) =>
  closings.includes(c.key) || /`\/laa[:-][a-z-]+[^`\n]*`/.test(c.next)

// A closing report as a card, on every surface: what stands above the status line as the reply's own
// markdown, then a round frame holding the status line in bold and everything under it, the Next list included.
// `tone` colors the frame and the status line as one item, and is register.tsx's to pick: `success` for ✓;
// for ✗, `error` only for the newest recorded report while the band shows no blocked branch, else `warning`
// (at most one red item on screen).
// Returns null to leave the block as the engine draws it: a surface whose table lacks an element the card
// needs, or a report too long for one drawing. register.tsx then answers `next(e)`, and has already passed on
// a summary block, a block that is no closing report, and a closing report that is not laa's.
export const reportCard = (els: Els, c: Closing, tone: Tone): RenderElement | null => {
  if (!('Box' in els) || !('Text' in els) || !('Markdown' in els)) return null
  const { Box, Markdown, Text } = els
  const pre = sanitize(c.pre ?? '')
  // The status line is drawn as Text, which takes one line: a tab in it is drawn as a space.
  const status = sanitize(c.status).replace(/\s+/g, ' ').trim()
  const rest = sanitize(c.rest)
  const hasPre = pre.trim() !== ''
  if (!status || !rest.trim() || pre.length + status.length + rest.length > MAX_DRAWN) return null
  return (
    <Box key="laa-report" flexDirection="column">
      {hasPre && <Markdown key="pre" text={pre} />}
      <Box key="frame" flexDirection="column" borderStyle="round" borderColor={tone} paddingX={1}>
        <Text bold color={tone}>{status}</Text>
        <Markdown key="rest" text={rest} />
      </Box>
    </Box>
  )
}

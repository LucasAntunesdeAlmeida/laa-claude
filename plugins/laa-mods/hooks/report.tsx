// Pure: which block of an assistant reply is a laa closing report, and the framed card it is drawn as.

import type { RenderElement } from 'claude-code'

import type { C, Els } from './draw'

// A closing report cut into the parts its card draws. `pre`, `statusRaw`, and `rest` are the block's own
// lines, untouched: joined with line breaks (`pre` left out when it is empty) they are the block again.
export type Closing = {
  // Everything above the status line; '' when the block opens with it.
  pre: string
  // The status line as written (`**✓ Fixed** · nil address`): what register.tsx records and compares.
  statusRaw: string
  // The status line without its `**`: the glyph, the title, then the rest of the line (`✓ Fixed · nil address`).
  status: string
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

// The block as a closing report, or null when it is not exactly one: the last `**✓ …**` or `**✗ …**` line,
// a `**Next**` line somewhere under it, then a list (items, their indented continuations, blank lines) that
// runs to the end of the block. A workflow's report (a status line with no Next) and a reply that goes on
// after the list are not closing reports.
export const closingOf = (text: string): Closing | null => {
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
  return {
    pre: lines.slice(0, s).join('\n'),
    statusRaw: lines[s] ?? '',
    status: `${m[1]} ${m[2]}${m[3]}`,
    ok: m[1] === '✓',
    rest: lines.slice(s + 1).join('\n'),
    next: list.join('\n'),
  }
}

// Whether a closing report is laa's: this session recorded its status line when a laa run ended with it,
// or (after a resume or a /clear, when nothing is recorded) its Next list names a laa command.
export const isLaaClosing = (c: Closing, closings: readonly string[]) =>
  closings.includes(c.statusRaw) || /`\/laa[:-][a-z-]+[^`\n]*`/.test(c.next)

// STUB (slice C draws it). A closing report as a card, on every surface:
//   <Box key="laa-report" flexDirection="column">
//     {c.pre && <Markdown key="pre" text={sanitize(c.pre)} />}
//     <Box key="frame" flexDirection="column" borderStyle="round" borderColor={tone} paddingX={1}>
//       <Text bold color={tone}>{c.status}</Text>
//       <Markdown key="rest" text={sanitize(c.rest)} />
//     </Box>
//   </Box>
// `tone` is register.tsx's to pick: `success` for ✓; for ✗, `error` only for the newest recorded report while
// the band shows no blocked branch, else `warning` (at most one red item on screen).
// Returns null to leave the block as the engine draws it; register.tsx then answers `next(e)`, and has already
// passed on a summary block, a block that is no closing report, and a closing report that is not laa's.
export const reportCard = (_els: Els, _c: Closing, _tone: Tone): RenderElement | null => null

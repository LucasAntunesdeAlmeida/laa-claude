// Pure: the engine cards' data (which workflows this session launched, the agents each started, how each
// ended) and the card a Workflow row draws from it. register.tsx owns the state and calls these reducers;
// every reducer returns the map it was given, the same object, when it changes nothing.

import type { RenderElement } from 'claude-code'

import type { EngineRun } from '../types'
import { sanitize } from './draw'
import type { Els } from './draw'
import { phaseOf, PHASES } from './tables'

// The session's engine runs by the tool_use_id of the Workflow call that launched each.
export type Cards = Readonly<Record<string, EngineRun>>

// One workflow agent starting, as `agent.spawn` reports it: the Workflow call and the run it belongs to
// (either may be '' on a resumed run), and its role ('' when its label names none).
export type Spawn = { toolUseId: string; runId: string; role: string }

// What a task notification says: whose it is, how the task ended, and the first line of the engine's report.
export type Notice = { toolUseId: string | null; taskId: string | null; status: string | null; report: string | null }

const MAX_CARDS = 20
const MAX_ROLES = 32
const MAX_NOTICE = 50000
const MAX_RESULT = 200

const running = (cards: Cards) => Object.keys(cards).filter(id => cards[id]?.state === 'running')

// The cards with a new running one for the Workflow call `id` of engine `name`. Made before the launch
// answers, since the run's first agents can start before it does. Past 20 cards the oldest goes.
// A call that already has a card keeps it.
export const startCard = (cards: Cards, id: string, name: string): Cards => {
  if (cards[id]) return cards
  const seq = Math.max(0, ...Object.values(cards).map(c => c.seq)) + 1
  const next: Record<string, EngineRun> = {
    ...cards,
    [id]: { seq, name, taskId: null, runId: null, state: 'running', roles: {}, count: 0, result: null, status: null },
  }
  const ids = Object.keys(next).sort((a, b) => (next[a]?.seq ?? 0) - (next[b]?.seq ?? 0))
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_CARDS))) delete next[old]
  return next
}

// The cards without the one for `id`: its launch was refused or failed, so there is no run to show.
export const dropCard = (cards: Cards, id: string): Cards => {
  if (!cards[id]) return cards
  const { [id]: _dropped, ...rest } = cards
  return rest
}

const textAt = (from: unknown, key: string) => {
  const value = from && typeof from === 'object' ? (from as Record<string, unknown>)[key] : undefined
  return typeof value === 'string' && value ? value : null
}

// The card with the task and run ids its launch answered with. `result` is the Workflow tool's own record,
// read as an unknown: a result of another shape leaves the card as it was.
export const launched = (card: EngineRun, result: unknown): EngineRun => {
  const taskId = textAt(result, 'taskId')
  const runId = textAt(result, 'runId')
  return taskId === card.taskId && runId === card.runId ? card : { ...card, taskId: taskId ?? card.taskId, runId: runId ?? card.runId }
}

// Which card a spawn belongs to, by its id in `cards`: the Workflow call's, else the run's, else the only
// engine still running; null when none of those names one, and the spawn is ignored.
export const cardFor = (cards: Cards, spawn: Pick<Spawn, 'toolUseId' | 'runId'>): string | null => {
  if (spawn.toolUseId && cards[spawn.toolUseId]) return spawn.toolUseId
  const byRun = spawn.runId ? Object.keys(cards).find(id => cards[id]?.runId === spawn.runId) : undefined
  if (byRun) return byRun
  const live = running(cards)
  return live.length === 1 ? live[0] ?? null : null
}

// The cards after a batch of spawns: each counted on its card, under its role when it has one. One pass
// for the whole batch, so register.tsx writes the state once however many agents a phase starts.
export const spawned = (cards: Cards, spawns: readonly Spawn[]): Cards => {
  let next: Record<string, EngineRun> | null = null
  for (const spawn of spawns) {
    const id = cardFor(next ?? cards, spawn)
    const card = id ? (next ?? cards)[id] : undefined
    if (!id || !card) continue
    const hasRoom = spawn.role !== '' && (spawn.role in card.roles || Object.keys(card.roles).length < MAX_ROLES)
    next = next ?? { ...cards }
    next[id] = {
      ...card,
      runId: card.runId ?? (spawn.runId || null),
      count: card.count + 1,
      roles: hasRoom ? { ...card.roles, [spawn.role]: (card.roles[spawn.role] ?? 0) + 1 } : card.roles,
    }
  }
  return next ?? cards
}

const tagOf = (text: string, name: string) => new RegExp(`<${name}>\\s*([^<\\s]+)\\s*</${name}>`).exec(text)?.[1] ?? null

// One line, safe to draw: the first line with text, without its `**`, at most 200 characters.
const firstLine = (text: string) => {
  const line = sanitize(text).split('\n').map(l => l.replace(/\*\*/g, '').trim()).find(l => l !== '')
  return line ? line.slice(0, MAX_RESULT) : null
}

// The engine's report in a notification: the workflow result's JSON `"report"` string when it parses, else
// the first `**…**` line of the `<result>` block.
const reportOf = (text: string) => {
  const quoted = /"report"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/.exec(text)?.[1]
  if (quoted !== undefined) {
    try {
      const report: unknown = JSON.parse(`"${quoted}"`)
      if (typeof report === 'string' && firstLine(report)) return firstLine(report)
    } catch {
      // A report cut mid-escape: fall back to the result block.
    }
  }
  const result = /<result>([\s\S]*?)(?:<\/result>|$)/.exec(text)?.[1] ?? ''
  const bold = /^\*\*.+$/m.exec(result)?.[0]
  return bold ? firstLine(bold) : null
}

// What a task notification's text says. Reads its first 50,000 characters; a field it doesn't find is null.
export const noticeOf = (text: string): Notice => {
  const head = text.slice(0, MAX_NOTICE)
  return {
    toolUseId: tagOf(head, 'tool-use-id'),
    taskId: tagOf(head, 'task-id'),
    status: tagOf(head, 'status'),
    report: reportOf(head),
  }
}

const stateOf = (status: string | null): EngineRun['state'] => {
  if (status && /fail|error/i.test(status)) return 'failed'
  if (status && /kill|stop|cancel|abort/i.test(status)) return 'ended'
  return 'done'
}

// The cards after a notification: its card (by the Workflow call's id, else the task's, else the only engine
// still running when the notification carries a report) takes the report and the way the task ended.
// null when the notification is no card's, and register.tsx falls back to `ended`.
export const finished = (cards: Cards, notice: Notice): Cards | null => {
  const live = running(cards)
  const id =
    (notice.toolUseId && cards[notice.toolUseId] ? notice.toolUseId : undefined) ??
    (notice.taskId ? Object.keys(cards).find(k => cards[k]?.taskId === notice.taskId) : undefined) ??
    (notice.report && live.length === 1 ? live[0] : undefined)
  const card = id ? cards[id] : undefined
  if (!id || !card) return null
  if (card.state !== 'running') return cards
  return { ...cards, [id]: { ...card, state: stateOf(notice.status), result: notice.report, status: notice.status } }
}

// The cards after a notification that named no card while the engine `name` was the one running: every
// running card of that engine is marked `ended`, with no result. `name` null changes nothing.
export const ended = (cards: Cards, name: string | null): Cards => {
  const ids = name === null ? [] : running(cards).filter(id => cards[id]?.name === name)
  if (ids.length === 0) return cards
  const next: Record<string, EngineRun> = { ...cards }
  for (const id of ids) {
    const card = next[id]
    if (card) next[id] = { ...card, state: 'ended' }
  }
  return next
}

// The phase a run has reached: the latest of its engine's phases any of its agents' roles works in.
// Derived, never stored; null before any agent with a known role has started.
export const phaseNow = (card: EngineRun): string | null => {
  const phases = PHASES[card.name] ?? []
  const reached = Object.keys(card.roles).map(role => phases.indexOf(phaseOf(card.name, role) ?? ''))
  return phases[Math.max(-1, ...reached)] ?? null
}

// STUB (slice B draws it). The card under a laa engine's Workflow row, on every surface, from Box and Text only:
//   <Box key="laa-wf" flexDirection="column">
//     {inner}                                   the engine's own row, as `next(e)` drew it
//     <Box key="laa-card" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
//       name (bold) · "laa engine" · agent count (dim)
//       the phases: ✓ done, ● current, ○ to come; once the run ended, a phase no agent worked in is a dim label with no glyph
//       the roles and their counts (dim, truncated): investigate ×5 · cluster · verify ×10
//       the result once there is one: `success` for a leading ✓, `warning` for ▲ or ✗, never `error`;
//       with no report, `✓ completed` or (in `warning`) `✗ failed`
//     </Box>
//   </Box>
// Returns null to leave the row as the engine drew it; register.tsx then draws `inner` alone, and has already
// passed on a workflow that is no laa engine, a call with no card, and an errored or interrupted row.
export const engineCard = (_els: Els, _inner: RenderElement, _card: EngineRun): RenderElement | null => null

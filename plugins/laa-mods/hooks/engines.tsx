// Pure: the engine cards' data (which workflows this session launched, the agents each started, how each
// ended) and the card a Workflow row draws from it. register.tsx owns the state and calls these reducers;
// every reducer returns the map it was given, the same object, when it changes nothing.

import type { RenderElement } from 'claude-code'

import type { EngineRun } from '../types'
import { C, sanitize } from './draw'
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
  const taskId = textAt(result, 'taskId') ?? card.taskId
  const runId = textAt(result, 'runId') ?? card.runId
  return taskId === card.taskId && runId === card.runId ? card : { ...card, taskId, runId }
}

// Which card a spawn belongs to, by its id in `cards`: the Workflow call's when the spawn names one (a
// whole run shares it, so a call that has no card is another workflow's and the spawn is ignored); else,
// on a resumed run that names no call, the run's, else the only engine still running, unless that one is
// known to be another run. null when none of those names one.
export const cardFor = (cards: Cards, spawn: Pick<Spawn, 'toolUseId' | 'runId'>): string | null => {
  if (spawn.toolUseId) return cards[spawn.toolUseId] ? spawn.toolUseId : null
  const byRun = spawn.runId ? Object.keys(cards).find(id => cards[id]?.runId === spawn.runId) : undefined
  if (byRun) return byRun
  const live = running(cards)
  const only = live.length === 1 ? live[0] : undefined
  const known = only ? cards[only]?.runId ?? null : null
  const isOther = known !== null && spawn.runId !== '' && known !== spawn.runId
  return only && !isOther ? only : null
}

// The cards after a batch of spawns: each counted on its card, under its role when it has one. One pass
// for the whole batch, so register.tsx writes the state once however many agents a phase starts.
// A card learns its run only from a spawn that names its Workflow call, never from a guessed match.
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
      runId: card.runId ?? (spawn.toolUseId === id && spawn.runId ? spawn.runId : null),
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

// The cards after a notification: its card takes the report and the way the task ended. The card is the
// one the notification names (by the Workflow call's id, else the task's), which may still settle a card
// marked `ended` on a guess; only `done` and `failed` are final. A notification that names another task
// (a call that has no card, or a task while every running card knows its own) changes nothing. One that
// names nobody and carries a report settles the only engine still running.
// null when the notification is no card's and names nobody, and register.tsx falls back to `ended`.
export const finished = (cards: Cards, notice: Notice): Cards | null => {
  const live = running(cards)
  const named =
    (notice.toolUseId && cards[notice.toolUseId] ? notice.toolUseId : undefined) ??
    (notice.taskId ? Object.keys(cards).find(k => cards[k]?.taskId === notice.taskId) : undefined)
  const isOthers = !named && (Boolean(notice.toolUseId) || (Boolean(notice.taskId) && live.every(k => cards[k]?.taskId != null)))
  if (isOthers) return cards
  const id = named ?? (notice.report && live.length === 1 ? live[0] : undefined)
  const card = id ? cards[id] : undefined
  if (!id || !card) return null
  if (card.state === 'done' || card.state === 'failed') return cards
  const state = stateOf(notice.status)
  if (card.state === state && card.result === notice.report && card.status === notice.status) return cards
  return { ...cards, [id]: { ...card, state, result: notice.report, status: notice.status } }
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

const SEP = ' ━ '

// How a phase stands on the card: finished, the one running now, still to come, or never worked in.
type Mark = 'done' | 'now' | 'todo' | 'skipped'

const GLYPH: Readonly<Record<Mark, string>> = { done: '✓ ', now: '● ', todo: '○ ', skipped: '' }

// Each phase's mark. While the run goes on: ✓ before the phase it has reached, ● on it, ○ after (all ○
// before any agent started). Once it completed: ✓ where an agent worked, skipped where none did. A run that
// failed or was stopped did not finish the phase it had reached: that one stays ○ with the ones after it.
const marksOf = (card: EngineRun, phases: readonly string[]): Mark[] => {
  const now = phases.indexOf(phaseNow(card) ?? '')
  const worked = new Set(Object.keys(card.roles).map(role => phaseOf(card.name, role)))
  return phases.map((phase, i) => {
    if (card.state === 'done') return worked.has(phase) ? 'done' : 'skipped'
    if (i < now) return 'done'
    return i === now && card.state === 'running' ? 'now' : 'todo'
  })
}

// The roles and how many agents each started: `investigate ×5 · cluster · verify ×10`; '' when none is known.
const rolesLine = (roles: Readonly<Record<string, number>>) =>
  Object.entries(roles).filter(([, n]) => n > 0).map(([role, n]) => (n === 1 ? role : `${role} ×${n}`)).join(' · ')

// The card's last line: the report's first line, toned by the glyph it opens with, else how the run ended;
// null while it runs. A failure is `warning`, never `error`: the card is not the one red item on screen.
const resultOf = (card: EngineRun): { text: string; color?: typeof C.success | typeof C.warning; isDim?: boolean } | null => {
  if (card.result) {
    const glyph = card.result.charAt(0)
    return { text: card.result, color: glyph === '✓' ? C.success : glyph === '▲' || glyph === '✗' ? C.warning : undefined }
  }
  if (card.state === 'done') return { text: '✓ completed', color: C.success }
  if (card.state === 'failed') return { text: '✗ failed', color: C.warning }
  // A notification that named a way of ending is a stop; one that matched nothing says only that it is over.
  if (card.state === 'ended') return card.status ? { text: '✗ stopped', color: C.warning } : { text: 'ended · no report', isDim: true }
  return null
}

// The card under a laa engine's Workflow row, on every surface, from Box and Text only: `inner` (the
// engine's own row, as `next(e)` drew it) first, then a dim round frame with the engine's name and agent
// count, its phases, its roles, and its result once it has one.
// Returns null to leave the row as the engine drew it; register.tsx then draws `inner` alone, and has already
// passed on a workflow that is no laa engine, a call with no card, and an errored or interrupted row.
export const engineCard = (els: Els, inner: RenderElement, card: EngineRun): RenderElement | null => {
  try {
    const { Box, Text } = els
    const phases = PHASES[card.name]
    if (!phases || typeof Box !== 'function' || typeof Text !== 'function') return null
    if (!Number.isInteger(card.count) || card.count < 0) return null
    const marks = marksOf(card, phases)
    const roles = card.count > 0 ? rolesLine(card.roles) : ''
    const result = resultOf(card)
    const agents = card.count > 0 ? ` · ${card.count} agent${card.count === 1 ? '' : 's'}` : ''
    // A prop is given only where it says something: toned, dim, or neither.
    const line = !result ? null
      : result.color ? <Text key="result" color={result.color} wrap="truncate-end">{result.text}</Text>
      : result.isDim ? <Text key="result" dimColor wrap="truncate-end">{result.text}</Text>
      : <Text key="result" wrap="truncate-end">{result.text}</Text>
    return (
      <Box key="laa-wf" flexDirection="column">
        {inner}
        <Box key="laa-card" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box key="head">
            <Text bold>{card.name}</Text>
            <Text dimColor>{` · laa engine${agents}`}</Text>
          </Box>
          <Box key="phases">
            {phases.flatMap((phase, i) => {
              const mark = marks[i] ?? 'todo'
              const text = `${GLYPH[mark]}${phase}`
              // Only the phase running now is in the default color.
              const label = mark === 'now' ? <Text key={`phase${i}`}>{text}</Text> : <Text key={`phase${i}`} dimColor>{text}</Text>
              return i === 0 ? [label] : [<Text key={`sep${i}`} dimColor>{SEP}</Text>, label]
            })}
          </Box>
          {roles !== '' && <Text key="roles" dimColor wrap="truncate-end">{roles}</Text>}
          {line}
        </Box>
      </Box>
    )
  } catch {
    return null
  }
}

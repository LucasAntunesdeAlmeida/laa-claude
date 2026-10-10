import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cardFor, engineCard, finished, launched, noticeOf, phaseNow, spawned, startCard } from '../hooks/engines'
import type { EngineRun } from '../types'
import { ALL_SURFACES, bash, fakeRepo, golden, notification, show, spawnWf, WF, WF_DONE, WF_LAUNCHED, WF_REPORT, wfCall } from './fake'
import type { Drawn, Fake } from './fake'

// The card under a laa engine's Workflow row: what a notification is read as, which card a spawn counts on,
// and the card as each surface is handed it while the engine runs and once it has ended. Every id, label,
// and report here is invented.

const MINIMAL = { options: { visuals: 'minimal' } }
const ENGINE_OWN = '<Box key="engine" />'

// A repo on a task branch with the engine's own row beneath the plugin, a clock to move, and how many
// times the plugin wrote each of its state values.
async function world($: Engine, on: On, f: Fake = {}) {
  fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, results: { Workflow: WF_LAUNCHED }, ...f })
  const clock = mock.clock(on)
  const writes: Record<string, number> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = (writes[e.key] ?? 0) + 1
    return next(e)
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'agent_test1' }))
  await $.tool.call(bash('git status'))
  return { clock, writes }
}

// A Workflow call's row in the transcript, as the engine raises it.
const row = (name = 'laa:investigate', props: { tool_use_id?: string; isErrored?: boolean; isInterrupted?: boolean } = {}) => ({
  plugin: 'laa-mods',
  component: 'ToolUse' as const,
  props: { tool_use_id: WF.toolUseId, tool: 'Workflow', input: { name, args: { bug: 'x' } } as unknown, isRunning: false, isErrored: false, isInterrupted: false, ...props },
})

// The row as one surface is handed it.
async function drawnOn($: Engine, surface: (typeof ALL_SURFACES)[number], target = row()) {
  const ui = await $.ui.mount({ ...target, surface })
  const tree = (await ui.drawn()) as Drawn
  await ui.unmount()
  return tree
}

// The row on all four surfaces: one tree for all.
async function expectRow($: Engine, want: string, target = row()) {
  for (const surface of ALL_SURFACES) expect(show(await drawnOn($, surface, target)), surface).toBe(golden(want))
}

const textOf = (node: Drawn): string => (typeof node === 'string' ? node : ((node.children ?? []) as Drawn[]).map(textOf).join(''))

// The card's lines as they read, top to bottom; none when the row has no card.
const linesOf = (tree: Drawn) => {
  const parts = typeof tree === 'string' ? [] : ((tree.children ?? []) as Drawn[])
  const card = parts.find(c => typeof c !== 'string' && c.props?.key === 'laa-card')
  return card && typeof card !== 'string' ? ((card.children ?? []) as Drawn[]).map(textOf) : []
}

// Fifteen agents of an investigate run: five angles, the cluster, nine verifiers.
const AGENTS = [
  ...['logs', 'recent-changes', 'data', 'config', 'callers'].map(angle => `investigate:${angle}`),
  'cluster',
  ...Array.from({ length: 9 }, (_, i) => `verify:${i + 1}:logic`),
]

// A launched investigate run whose agents with these labels have started and been counted.
async function launch($: Engine, clock: { advance: (ms: number) => Promise<unknown> }, labels: readonly string[] = AGENTS) {
  await $.tool.call(wfCall())
  for (const [i, label] of labels.entries()) await $.agent.spawn(spawnWf(label, { agentIndex: i + 1 }))
  await clock.advance(200)
}

const ids = `<task-id>${WF.taskId}</task-id>\n<tool-use-id>${WF.toolUseId}</tool-use-id>`

describe('task notifications', () => {
  test("reads whose it is, how it ended, and the first line of a JSON result's report", () => {
    expect(noticeOf(`<task-notification>\n${WF_DONE}\n</task-notification>`)).toEqual({
      toolUseId: WF.toolUseId,
      taskId: WF.taskId,
      status: 'completed',
      report: WF_REPORT,
    })
  })

  test('reads a report written as plain Markdown in the result', () => {
    const text = `${ids}\n<status>completed</status>\n<result>\nThe panel finished.\n\n**▲ 1 of 3 root causes survived** · weak evidence\n- ✗ \`b.go:7\` stale cache\n</result>`
    expect(noticeOf(text).report).toBe('▲ 1 of 3 root causes survived · weak evidence')
  })

  test('answers null for what a notification does not carry', () => {
    expect(noticeOf('task t9 completed')).toEqual({ toolUseId: null, taskId: null, status: null, report: null })
    expect(noticeOf(`${ids}\n<status>failed</status>\n<summary>Workflow "investigate" failed</summary>`)).toEqual({
      toolUseId: WF.toolUseId,
      taskId: WF.taskId,
      status: 'failed',
      report: null,
    })
  })

  test('finds no report in a JSON result cut before its report ends', () => {
    const cut = `${ids}\n<status>completed</status>\n<result>{"report":"**✓ 2 of 3 root causes survived** · 5 angles\\n- ✓ \`a.go:1\` nil addr\\`
    expect(noticeOf(cut)).toMatchObject({ toolUseId: WF.toolUseId, status: 'completed', report: null })
  })

  test('strips control characters from a report and keeps 200 characters of it', () => {
    const report = noticeOf(`<result>${JSON.stringify({ report: `**✓ \u001b[31mdone\u001b[0m** ${'x'.repeat(400)}` })}</result>`).report ?? ''
    expect(report.startsWith('✓ done x')).toBe(true)
    expect(report).toHaveLength(200)
  })

  test('reads only the first 50,000 characters', () => {
    const padding = 'x'.repeat(60000)
    const late = noticeOf(`<status>completed</status>\n${padding}\n${ids}\n<result>{"report":"**✓ late**"}</result>`)
    expect(late).toEqual({ toolUseId: null, taskId: null, status: 'completed', report: null })
    // A report that never closes, all escapes, is read through without a stall.
    expect(noticeOf(`"report": "${'\\\\'.repeat(40000)}`).report).toBeNull()
  })
})

const fresh = startCard({}, WF.toolUseId, 'investigate')
const cardOf = (cards: Readonly<Record<string, EngineRun>>, id = WF.toolUseId) => cards[id] as EngineRun

describe('which card a spawn counts on', () => {
  test('a spawn that arrives before the launch is attached is counted, and the launch keeps the count', () => {
    expect(cardOf(fresh)).toMatchObject({ taskId: null, runId: null, count: 0 })
    const early = spawned(fresh, [{ toolUseId: '', runId: WF.runId, role: 'investigate' }])
    expect(cardOf(early)).toMatchObject({ runId: WF.runId, roles: { investigate: 1 }, count: 1 })
    const attached = launched(cardOf(early), WF_LAUNCHED)
    expect(attached).toMatchObject({ taskId: WF.taskId, runId: WF.runId, roles: { investigate: 1 }, count: 1 })
    // A launch answer of another shape, or the same ids again, changes nothing.
    expect(launched(attached, 'ran')).toBe(attached)
    expect(launched(attached, WF_LAUNCHED)).toBe(attached)
  })

  test('by the Workflow call, then by the run, then the only engine still running', () => {
    const one = { ...fresh, [WF.toolUseId]: launched(cardOf(fresh), WF_LAUNCHED) }
    const two = startCard(one, 'toolu_test2', 'review-panel')
    const both = { ...two, toolu_test2: launched(cardOf(two, 'toolu_test2'), { taskId: 'task_test2', runId: 'wf_test2' }) }
    expect(cardFor(both, { toolUseId: 'toolu_test2', runId: WF.runId })).toBe('toolu_test2')
    expect(cardFor(both, { toolUseId: 'toolu_test9', runId: WF.runId })).toBe(WF.toolUseId)
    expect(cardFor(both, { toolUseId: '', runId: 'wf_test2' })).toBe('toolu_test2')
    // Two engines running and nothing that names one: the spawn is nobody's.
    expect(cardFor(both, { toolUseId: '', runId: '' })).toBeNull()
    expect(spawned(both, [{ toolUseId: '', runId: '', role: 'verify' }])).toBe(both)

    const done = finished(both, noticeOf(WF_DONE)) ?? both
    expect(cardFor(done, { toolUseId: '', runId: '' })).toBe('toolu_test2')
    expect(cardFor(done, { toolUseId: 'toolu_test9', runId: '' })).toBe('toolu_test2')
    // The only running engine is known to be another run: not its spawn.
    expect(cardFor(done, { toolUseId: '', runId: 'wf_test9' })).toBeNull()
    expect(cardFor({}, { toolUseId: WF.toolUseId, runId: WF.runId })).toBeNull()
  })

  test('the phase a run has reached is the latest any of its roles works in', () => {
    const at = (roles: Record<string, number>, name = 'investigate') => phaseNow({ ...cardOf(fresh), name, roles })
    expect(at({})).toBeNull()
    expect(at({ verify: 2, investigate: 5 })).toBe('Verify')
    expect(at({ investigate: 5, helper: 1 })).toBe('Investigate')
    expect(at({ architect: 3 }, 'design-panel')).toBe('Propose')
    expect(at({ investigate: 1 }, 'nightly-report')).toBeNull()
  })
})

describe('engine card', () => {
  test('a spawn that arrives while the launch is still answering shows on the card', async ($, on) => {
    const { clock } = await world($, on, {
      duringTool: async (_, e) => {
        if (e.tool === 'Workflow') await $.agent.spawn(spawnWf('investigate:logs'))
      },
    })
    await $.tool.call(wfCall())
    await clock.advance(200)
    expect(linesOf(await drawnOn($, 'terminal'))).toEqual([
      'investigate · laa engine · 1 agent',
      '● Investigate ━ ○ Cluster ━ ○ Verify',
      'investigate',
    ])
  })

  test('before any agent starts: the name and every phase still to come', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, [])
    await expectRow($, `
      <Box flexDirection="column" key="laa-wf">
        <Box key="engine" />
        <Box borderDimColor borderStyle="round" flexDirection="column" key="laa-card" paddingX=1>
          <Box key="head">
            <Text bold>"investigate"</Text>
            <Text dimColor>" · laa engine"</Text>
          </Box>
          <Box key="phases">
            <Text dimColor>"○ Investigate"</Text>
            <Text dimColor>" ━ "</Text>
            <Text dimColor>"○ Cluster"</Text>
            <Text dimColor>" ━ "</Text>
            <Text dimColor>"○ Verify"</Text>
          </Box>
        </Box>
      </Box>`)
  })

  test('while it runs, on every surface: the agents, the phase it has reached, and the roles', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock)
    await expectRow($, `
      <Box flexDirection="column" key="laa-wf">
        <Box key="engine" />
        <Box borderDimColor borderStyle="round" flexDirection="column" key="laa-card" paddingX=1>
          <Box key="head">
            <Text bold>"investigate"</Text>
            <Text dimColor>" · laa engine · 15 agents"</Text>
          </Box>
          <Box key="phases">
            <Text dimColor>"✓ Investigate"</Text>
            <Text dimColor>" ━ "</Text>
            <Text dimColor>"✓ Cluster"</Text>
            <Text dimColor>" ━ "</Text>
            <Text>"● Verify"</Text>
          </Box>
          <Text dimColor wrap="truncate-end">"investigate ×5 · cluster · verify ×9"</Text>
        </Box>
      </Box>`)
  })

  test('once it completed, on every surface: every phase done and the first line of its report', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock)
    await $.session.append(notification())
    await expectRow($, `
      <Box flexDirection="column" key="laa-wf">
        <Box key="engine" />
        <Box borderDimColor borderStyle="round" flexDirection="column" key="laa-card" paddingX=1>
          <Box key="head">
            <Text bold>"investigate"</Text>
            <Text dimColor>" · laa engine · 15 agents"</Text>
          </Box>
          <Box key="phases">
            <Text dimColor>"✓ Investigate"</Text>
            <Text dimColor>" ━ "</Text>
            <Text dimColor>"✓ Cluster"</Text>
            <Text dimColor>" ━ "</Text>
            <Text dimColor>"✓ Verify"</Text>
          </Box>
          <Text dimColor wrap="truncate-end">"investigate ×5 · cluster · verify ×9"</Text>
          <Text color="success" wrap="truncate-end">"${WF_REPORT}"</Text>
        </Box>
      </Box>`)
  })

  test('a mounted row is drawn again as its engine moves on', async ($, on) => {
    const { clock } = await world($, on)
    await $.tool.call(wfCall())
    const ui = await $.ui.mount({ ...row(), surface: 'terminal' })
    expect(linesOf((await ui.drawn()) as Drawn)).toEqual(['investigate · laa engine', '○ Investigate ━ ○ Cluster ━ ○ Verify'])
    await $.agent.spawn(spawnWf('investigate:logs'))
    await $.agent.spawn(spawnWf('investigate:data'))
    await clock.advance(200)
    expect(linesOf((await ui.drawn()) as Drawn)).toEqual([
      'investigate · laa engine · 2 agents',
      '● Investigate ━ ○ Cluster ━ ○ Verify',
      'investigate ×2',
    ])
    await ui.unmount()
  })

  test('a phase no agent worked in is skipped once the run completed: its label, with no mark', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, ['investigate:logs', 'verify:1:logic', 'Unlabelled agent'])
    expect(linesOf(await drawnOn($, 'terminal'))[1]).toBe('✓ Investigate ━ ✓ Cluster ━ ● Verify')
    await $.session.append(notification(`${ids}\n<status>completed</status>`))
    for (const surface of ALL_SURFACES) {
      const tree = await drawnOn($, surface)
      expect(linesOf(tree), surface).toEqual([
        'investigate · laa engine · 3 agents',
        '✓ Investigate ━ Cluster ━ ✓ Verify',
        'investigate · verify',
        '✓ completed',
      ])
      expect(show(tree), surface).toContain('<Text dimColor>"Cluster"</Text>')
      expect(show(tree), surface).toContain('<Text color="success" wrap="truncate-end">"✓ completed"</Text>')
    }
  })

  test("the result takes its tone from the report's first glyph", async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, ['investigate:logs'])
    const report = (line: string) => `${ids}\n<status>completed</status>\n<result>${JSON.stringify({ report: `${line}\n- detail` })}</result>`
    await $.session.append(notification(report('**▲ 1 of 3 root causes survived** · weak evidence')))
    expect(show(await drawnOn($, 'desktop'))).toContain('<Text color="warning" wrap="truncate-end">"▲ 1 of 3 root causes survived · weak evidence"</Text>')

    await $.tool.call(wfCall('laa:review-panel', 'toolu_test2'))
    await $.session.append(notification(report('3 reviewers found nothing').replace(WF.toolUseId, 'toolu_test2').replace(WF.taskId, 'task_test2'), 'row-n2'))
    const second = await drawnOn($, 'desktop', row('laa:review-panel', { tool_use_id: 'toolu_test2' }))
    expect(linesOf(second)).toEqual(['review-panel · laa engine', 'Review ━ Verify', '3 reviewers found nothing'])
    expect(show(second)).toContain('<Text wrap="truncate-end">"3 reviewers found nothing"</Text>')
  })

  test('a failed engine says so in the warning color, never in red', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, ['investigate:logs', 'cluster'])
    await $.session.append(notification(`<task-id>${WF.taskId}</task-id>\n<status>failed</status>\n<summary>Workflow "investigate" failed</summary>`))
    for (const surface of ALL_SURFACES) {
      const tree = await drawnOn($, surface)
      // It did not finish the phase it had reached.
      expect(linesOf(tree), surface).toEqual(['investigate · laa engine · 2 agents', '✓ Investigate ━ ○ Cluster ━ ○ Verify', 'investigate · cluster', '✗ failed'])
      expect(show(tree), surface).toContain('<Text color="warning" wrap="truncate-end">"✗ failed"</Text>')
      expect(show(tree), surface).not.toContain('error')
    }

    // A report that opens with ✗ is a warning too.
    await $.tool.call(wfCall('laa:investigate', 'toolu_test2'))
    await $.session.append(notification('<tool-use-id>toolu_test2</tool-use-id>\n<status>failed</status>\n<result>\n**✗ no root cause survived verification**\n</result>', 'row-n2'))
    const second = show(await drawnOn($, 'terminal', row('laa:investigate', { tool_use_id: 'toolu_test2' })))
    expect(second).toContain('<Text color="warning" wrap="truncate-end">"✗ no root cause survived verification"</Text>')
    expect(second).not.toContain('error')
  })

  test('an engine that was stopped says so, and one whose end named no report says only that it ended', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, ['investigate:logs'])
    await $.session.append(notification(`${ids}\n<status>killed</status>`))
    const stopped = await drawnOn($, 'terminal')
    expect(linesOf(stopped)).toEqual(['investigate · laa engine · 1 agent', '○ Investigate ━ ○ Cluster ━ ○ Verify', 'investigate', '✗ stopped'])
    expect(show(stopped)).toContain('<Text color="warning" wrap="truncate-end">"✗ stopped"</Text>')

    await $.skill.prompt({ skill: 'laa:fix', text: '# /laa:fix\n\nBug: something\n' })
    await $.tool.call(wfCall('laa:investigate', 'toolu_test2'))
    await $.session.append(notification('task t9 completed', 'row-n2'))
    const ended = await drawnOn($, 'terminal', row('laa:investigate', { tool_use_id: 'toolu_test2' }))
    expect(linesOf(ended)).toEqual(['investigate · laa engine', '○ Investigate ━ ○ Cluster ━ ○ Verify', 'ended · no report'])
    expect(show(ended)).toContain('<Text dimColor wrap="truncate-end">"ended · no report"</Text>')
    expect(show(stopped) + show(ended)).not.toContain('error')
  })

  test("draws the engine's own row alone for another workflow, an unknown call, and a row that errored or was interrupted", async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock)
    await $.tool.call(wfCall('nightly-report', 'toolu_test2'))
    await expectRow($, ENGINE_OWN, row('nightly-report', { tool_use_id: 'toolu_test2' }))
    await expectRow($, ENGINE_OWN, row('nightly-report'))
    await expectRow($, ENGINE_OWN, row('laa:investigate', { tool_use_id: 'toolu_test9' }))
    await expectRow($, ENGINE_OWN, row('laa:investigate', { isErrored: true }))
    await expectRow($, ENGINE_OWN, row('laa:investigate', { isInterrupted: true }))
    // A row whose input is not a Workflow call's.
    await expectRow($, ENGINE_OWN, { ...row(), props: { ...row().props, input: null } })
  })

  test('draws nothing of its own from a card it cannot read', () => {
    const card = cardOf(fresh)
    expect(engineCard({} as never, 'row' as never, card)).toBeNull()
    expect(engineCard({} as never, 'row' as never, { ...card, name: 'nightly-report' })).toBeNull()
    expect(engineCard(null as never, 'row' as never, card)).toBeNull()
  })

  test('64 spawns write the cards at most three times, and none of them before the spawn returns', async ($, on) => {
    const { clock, writes } = await world($, on)
    await $.tool.call(wfCall())
    const before = { ...writes }
    for (let i = 0; i < 64; i += 1) {
      await $.agent.spawn(spawnWf(`verify:${i + 1}:logic`, { agentIndex: i + 1 }))
      expect(writes, `spawn ${i + 1}`).toEqual(before)
    }
    await clock.advance(200)
    const made = (writes.engines ?? 0) - (before.engines ?? 0)
    expect(made).toBeGreaterThanOrEqual(1)
    expect(made).toBeLessThanOrEqual(3)
    expect(linesOf(await drawnOn($, 'terminal'))).toEqual(['investigate · laa engine · 64 agents', '✓ Investigate ━ ✓ Cluster ━ ● Verify', 'verify ×64'])
  })

  test("draws the engine's own row alone under visuals: minimal", MINIMAL, async ($, on) => {
    const { clock, writes } = await world($, on)
    await launch($, clock)
    await expectRow($, ENGINE_OWN)
    await $.session.append(notification())
    await expectRow($, ENGINE_OWN)
    expect(writes.engines).toBeUndefined()
  })
})

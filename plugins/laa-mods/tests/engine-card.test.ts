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
// times the plugin wrote each of its state values, and read each.
async function world($: Engine, on: On, f: Fake = {}) {
  fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, results: { Workflow: WF_LAUNCHED }, ...f })
  const clock = mock.clock(on)
  const writes: Record<string, number> = {}
  const reads: Record<string, number> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = (writes[e.key] ?? 0) + 1
    return next(e)
  })
  on('state.get', ($, e, next) => {
    reads[e.key] = (reads[e.key] ?? 0) + 1
    return next(e)
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'agent_test1' }))
  await $.tool.call(bash('git switch -'))
  return { clock, writes, reads }
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

// A workflow's notification with every block a real session's carries, in their order (the shape is from a
// real run; every id, path, and number is invented): the output file, the diagnostics, and the usage stand
// around the status and the result, and the summary names the workflow by its description, not its name.
const LIVE_SHAPED = [
  `<task-id>${WF.taskId}</task-id>`,
  `<tool-use-id>${WF.toolUseId}</tool-use-id>`,
  '<output-file>C:\\Users\\me\\tmp\\tasks\\task_test1.output</output-file>',
  '<status>completed</status>',
  '<summary>Dynamic workflow "Engine · root-cause fan-out" completed</summary>',
  `<result>${JSON.stringify({ hypotheses: [], report: '**✓ 2 of 3 root causes survived verification** · 5 angles\n- ✓ `a.go:1` nil address' })}</result>`,
  '<diagnostics>Per-agent results: C:\\Users\\me\\runs\\wf_test1/journal.jsonl — one {"type":"result",...} line per completed agent.',
  "To re-run: Workflow({scriptPath: 'C:\\Users\\me\\scripts\\investigate-wf_test1.js', resumeFromRunId: 'wf_test1', args: {\"bug\":\"x\"}})</diagnostics>",
  '<usage><agent_count>15</agent_count><agents_done>15</agents_done><agents_error>0</agents_error><duration_ms>90000</duration_ms></usage>',
].join('\n')

// A workflow result too long for a notification: Claude Code keeps its first 8,000 characters and says where
// the whole of it is. The engines return `report` first, so the cut never takes it.
const cutAt8000 = (json: string) => `${json.slice(0, 8000)}... (truncated ${json.length - 8000} chars, full result in C:/r/out.json)`
const CUT_REPORT = '2 of 5 root causes survived verification · 5 angles'
const LONG_RESULT = {
  report: `**${CUT_REPORT}**\n- ✓ \`pay/retry.go:31\` retry reuses the key of a failed charge · 2 confirmed, 0 refuted`,
  degraded: [] as string[],
  hypotheses: Array.from({ length: 40 }, (_, i) => ({ rootCause: `cause ${i}`, location: `pay/retry.go:${i + 1}`, mechanism: 'a retried webhook finds the old key '.repeat(8) })),
}
const CUT_SHAPED = [
  `<task-id>${WF.taskId}</task-id>`,
  `<tool-use-id>${WF.toolUseId}</tool-use-id>`,
  '<status>completed</status>',
  '<summary>Dynamic workflow "Engine · root-cause fan-out" completed</summary>',
  `<result>${cutAt8000(JSON.stringify(LONG_RESULT))}</result>`,
].join('\n')

describe('task notifications', () => {
  test("reads whose it is, how it ended, and the first line of a JSON result's report", () => {
    expect(noticeOf(`<task-notification>\n${WF_DONE}\n</task-notification>`)).toEqual({
      toolUseId: WF.toolUseId,
      taskId: WF.taskId,
      status: 'completed',
      report: WF_REPORT,
    })
  })

  test('reads a notification with every block a real session sends around the status and the result', () => {
    expect(noticeOf(`<task-notification>\n${LIVE_SHAPED}\n</task-notification>`)).toEqual({
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

  test('finds the report of a result cut to its first 8,000 characters, as a notification carries a long one', () => {
    expect(noticeOf(`<task-notification>\n${CUT_SHAPED}\n</task-notification>`)).toEqual({
      toolUseId: WF.toolUseId,
      taskId: WF.taskId,
      status: 'completed',
      report: CUT_REPORT,
    })
    expect(CUT_SHAPED).toContain('"degraded":[],"hypotheses":[')
    expect(CUT_SHAPED).toMatch(/\.\.\. \(truncated \d+ chars, full result in C:\/r\/out\.json\)<\/result>$/)
    // The same result with its report last loses it to the cut: which is why the engines return it first.
    const { report, degraded, ...rest } = LONG_RESULT
    expect(noticeOf(`${ids}\n<status>completed</status>\n<result>${cutAt8000(JSON.stringify({ ...rest, report, degraded }))}</result>`).report).toBeNull()
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
    const early = spawned(fresh, [{ toolUseId: WF.toolUseId, runId: WF.runId, role: 'investigate' }])
    expect(cardOf(early)).toMatchObject({ runId: WF.runId, roles: { investigate: 1 }, count: 1 })
    const attached = launched(cardOf(early), WF_LAUNCHED)
    expect(attached).toMatchObject({ taskId: WF.taskId, runId: WF.runId, roles: { investigate: 1 }, count: 1 })
    // A launch answer of another shape, or the same ids again, changes nothing.
    expect(launched(attached, 'ran')).toBe(attached)
    expect(launched(attached, WF_LAUNCHED)).toBe(attached)
  })

  test('a card learns its run only from a spawn that names its Workflow call', () => {
    // A spawn that names no call is counted on the only running engine, but its run is a guess.
    const guessed = spawned(fresh, [{ toolUseId: '', runId: 'wf_test9', role: 'investigate' }])
    expect(cardOf(guessed)).toMatchObject({ runId: null, roles: { investigate: 1 }, count: 1 })
    const named = spawned(guessed, [{ toolUseId: WF.toolUseId, runId: WF.runId, role: 'verify' }])
    expect(cardOf(named)).toMatchObject({ runId: WF.runId, roles: { investigate: 1, verify: 1 }, count: 2 })
  })

  test('by the Workflow call, then by the run, then the only engine still running', () => {
    const one = { ...fresh, [WF.toolUseId]: launched(cardOf(fresh), WF_LAUNCHED) }
    const two = startCard(one, 'toolu_test2', 'review-panel')
    const both = { ...two, toolu_test2: launched(cardOf(two, 'toolu_test2'), { taskId: 'task_test2', runId: 'wf_test2' }) }
    expect(cardFor(both, { toolUseId: 'toolu_test2', runId: WF.runId })).toBe('toolu_test2')
    // A call that has no card is another workflow's, whatever else the spawn names.
    expect(cardFor(both, { toolUseId: 'toolu_test9', runId: WF.runId })).toBeNull()
    expect(cardFor(both, { toolUseId: '', runId: WF.runId })).toBe(WF.toolUseId)
    expect(cardFor(both, { toolUseId: '', runId: 'wf_test2' })).toBe('toolu_test2')
    // Two engines running and nothing that names one: the spawn is nobody's.
    expect(cardFor(both, { toolUseId: '', runId: '' })).toBeNull()
    expect(spawned(both, [{ toolUseId: '', runId: '', role: 'verify' }])).toBe(both)

    const done = finished(both, noticeOf(WF_DONE)) ?? both
    expect(cardFor(done, { toolUseId: '', runId: '' })).toBe('toolu_test2')
    expect(cardFor(done, { toolUseId: 'toolu_test9', runId: '' })).toBeNull()
    expect(spawned(done, [{ toolUseId: 'toolu_test9', runId: '', role: 'verify' }])).toBe(done)
    // The only running engine is known to be another run: not its spawn.
    expect(cardFor(done, { toolUseId: '', runId: 'wf_test9' })).toBeNull()
    expect(cardFor({}, { toolUseId: WF.toolUseId, runId: WF.runId })).toBeNull()
  })

  test('a card lists 32 roles: an agent of a 33rd is counted, and not listed', () => {
    const role = (i: number) => `role-${String.fromCharCode(97 + (i % 26))}${i < 26 ? '' : '-more'}`
    const spawns = Array.from({ length: 33 }, (_, i) => ({ toolUseId: WF.toolUseId, runId: WF.runId, role: role(i) }))
    const full = cardOf(spawned(fresh, spawns))
    expect(full.count).toBe(33)
    expect(Object.keys(full.roles)).toEqual(spawns.slice(0, 32).map(s => s.role))
    expect(full.roles[role(32)]).toBeUndefined()
    // A role already listed still counts its agents.
    const again = cardOf(spawned({ [WF.toolUseId]: full }, [{ toolUseId: WF.toolUseId, runId: WF.runId, role: role(0) }]))
    expect([again.count, again.roles[role(0)], Object.keys(again.roles).length]).toEqual([34, 2, 32])
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

// Two engines launched and both still running.
const pair = () => {
  const one = { ...fresh, [WF.toolUseId]: launched(cardOf(fresh), WF_LAUNCHED) }
  const two = startCard(one, 'toolu_test2', 'review-panel')
  return { ...two, toolu_test2: launched(cardOf(two, 'toolu_test2'), { taskId: 'task_test2', runId: 'wf_test2' }) }
}

const REPORT_ONLY = '<status>completed</status>\n<result>\n**✓ nothing to fix** · 3 reviewers\n</result>'
const STRAY = '<task-id>task_bg7</task-id>\n<tool-use-id>toolu_bg7</tool-use-id>\n<status>completed</status>'
const STRAY_REPORT = `${STRAY}\n<result>\n**✓ nightly export finished** · 4 files\n</result>`

describe('which card a notification settles', () => {
  test('one that names nobody and carries a report settles the only engine still running', () => {
    const one = { ...fresh, [WF.toolUseId]: launched(cardOf(fresh), WF_LAUNCHED) }
    const settled = finished(one, noticeOf(REPORT_ONLY))
    expect(cardOf(settled ?? {})).toMatchObject({ state: 'done', status: 'completed', result: '✓ nothing to fix · 3 reviewers' })
    // With no report it is nobody's, and with two engines running there is no only one.
    expect(finished(one, noticeOf('<status>completed</status>'))).toBeNull()
    expect(finished(pair(), noticeOf(REPORT_ONLY))).toBeNull()
    expect(finished({}, noticeOf(REPORT_ONLY))).toBeNull()
  })

  test("another task's notification changes nothing, with a report or without", () => {
    const one = { ...fresh, [WF.toolUseId]: launched(cardOf(fresh), WF_LAUNCHED) }
    expect(finished(one, noticeOf(STRAY))).toBe(one)
    expect(finished(one, noticeOf(STRAY_REPORT))).toBe(one)
    // By its task alone, while every running engine knows its own task.
    expect(finished(one, noticeOf('<task-id>task_bg7</task-id>\n<status>completed</status>'))).toBe(one)
    expect(finished(one, noticeOf(STRAY_REPORT.replace('<tool-use-id>toolu_bg7</tool-use-id>\n', '')))).toBe(one)
    expect(finished(pair(), noticeOf(STRAY_REPORT))).toEqual(pair())
    // An engine whose launch has not answered yet may be the task a report names.
    const settled = finished(fresh, noticeOf(STRAY_REPORT.replace('<tool-use-id>toolu_bg7</tool-use-id>\n', '')))
    expect(cardOf(settled ?? {})).toMatchObject({ state: 'done', result: '✓ nightly export finished · 4 files' })
  })

  test('a card ended on a guess still takes its own notification; a done or failed one is final', () => {
    const one = { ...fresh, [WF.toolUseId]: { ...launched(cardOf(fresh), WF_LAUNCHED), state: 'ended' as const } }
    const settled = finished(one, noticeOf(WF_DONE)) ?? {}
    expect(cardOf(settled)).toMatchObject({ state: 'done', status: 'completed', result: WF_REPORT })
    expect(finished(settled, noticeOf(WF_DONE))).toBe(settled)
    expect(finished(settled, noticeOf(`<task-id>${WF.taskId}</task-id>\n<status>failed</status>`))).toBe(settled)
    const failed = finished(one, noticeOf(`<task-id>${WF.taskId}</task-id>\n<status>failed</status>`)) ?? {}
    expect(cardOf(failed)).toMatchObject({ state: 'failed', result: null })
    expect(finished(failed, noticeOf(WF_DONE))).toBe(failed)
    // The same stop told twice changes nothing the second time.
    const stopped = finished(one, noticeOf(`<task-id>${WF.taskId}</task-id>\n<status>killed</status>`)) ?? {}
    expect(cardOf(stopped)).toMatchObject({ state: 'ended', status: 'killed' })
    expect(finished(stopped, noticeOf(`<task-id>${WF.taskId}</task-id>\n<status>killed</status>`))).toBe(stopped)
  })

  test('keeps the newest 20 cards', () => {
    let cards: Readonly<Record<string, EngineRun>> = {}
    for (let i = 1; i <= 23; i += 1) cards = startCard(cards, `toolu_test${i}`, 'investigate')
    expect(Object.keys(cards)).toHaveLength(20)
    expect(Object.keys(cards)).toEqual(Array.from({ length: 20 }, (_, i) => `toolu_test${i + 4}`))
    expect(cardOf(cards, 'toolu_test23').seq).toBe(23)
    // A call that already has a card keeps it.
    expect(startCard(cards, 'toolu_test23', 'review-panel')).toBe(cards)
  })
})

describe('engine card', () => {
  test("another task's notification leaves a running engine's card running, and its own report still lands", async ($, on) => {
    const { clock } = await world($, on)
    await $.skill.prompt({ skill: 'laa:fix', text: '# /laa:fix\n\nBug: something\n' })
    await launch($, clock, ['investigate:logs'])
    const running = ['investigate · laa engine · 1 agent', '● Investigate ━ ○ Cluster ━ ○ Verify', 'investigate']
    await $.session.append(notification(STRAY, 'row-n2'))
    expect(linesOf(await drawnOn($, 'terminal'))).toEqual(running)
    await $.session.append(notification(STRAY_REPORT, 'row-n3'))
    expect(linesOf(await drawnOn($, 'terminal'))).toEqual(running)
    await $.session.append(notification())
    expect(linesOf(await drawnOn($, 'terminal'))).toEqual(['investigate · laa engine · 1 agent', '✓ Investigate ━ Cluster ━ Verify', 'investigate', WF_REPORT])
  })

  test('a card ended by a notification that named nobody takes its own report when it comes', async ($, on) => {
    const { clock } = await world($, on)
    await $.skill.prompt({ skill: 'laa:fix', text: '# /laa:fix\n\nBug: something\n' })
    await launch($, clock, ['investigate:logs'])
    await $.session.append(notification('task t9 completed', 'row-n2'))
    expect(linesOf(await drawnOn($, 'terminal')).at(-1)).toBe('ended · no report')
    await $.session.append(notification())
    expect(linesOf(await drawnOn($, 'terminal')).at(-1)).toBe(WF_REPORT)
  })

  test("the design panel's deep-dive specialists count in its last phase", async ($, on) => {
    const { clock } = await world($, on)
    await $.tool.call(wfCall('laa:design-panel'))
    const labels = ['architect:1', 'architect:2', 'judge:1', 'synthesize', 'dataModel', 'api', 'threatModel', 'scaleRisks', 'infra']
    for (const [i, label] of labels.entries()) await $.agent.spawn(spawnWf(label, { agentIndex: i + 1 }))
    await clock.advance(200)
    const panel = row('laa:design-panel')
    expect(linesOf(await drawnOn($, 'terminal', panel))).toEqual([
      'design-panel · laa engine · 9 agents',
      '✓ Propose ━ ✓ Judge ━ ✓ Synthesize ━ ● Deep-dive',
      'architect ×2 · judge · synthesize · data · api · threat · scale · infra',
    ])
    await $.session.append(notification(`${ids}\n<status>completed</status>`))
    expect(linesOf(await drawnOn($, 'terminal', panel))[1]).toBe('✓ Propose ━ ✓ Judge ━ ✓ Synthesize ━ ✓ Deep-dive')
  })

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
            <Text weight="semibold">"investigate"</Text>
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
            <Text weight="semibold">"investigate"</Text>
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
            <Text weight="semibold">"investigate"</Text>
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

  test('a notification that starts its own turn, as a real session delivers one, settles the card', async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, ['investigate:logs', 'cluster', 'verify:1:logic'])
    await $.session.append({ ...notification(LIVE_SHAPED), door: 'prompt' as const, origin: { kind: 'task-notification' as const } })
    expect(linesOf(await drawnOn($, 'terminal'))).toEqual([
      'investigate · laa engine · 3 agents',
      '✓ Investigate ━ ✓ Cluster ━ ✓ Verify',
      'investigate · cluster · verify',
      WF_REPORT,
    ])
  })

  test("a result too long for its notification still puts its report's first line on the card", async ($, on) => {
    const { clock } = await world($, on)
    await launch($, clock, ['investigate:logs', 'cluster', 'verify:1:logic'])
    await $.session.append(notification(CUT_SHAPED))
    expect(linesOf(await drawnOn($, 'terminal')).at(-1)).toBe(CUT_REPORT)
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

  test('64 spawns write the cards at most three times, and no spawn reads or writes state before it returns', async ($, on) => {
    const { clock, writes, reads } = await world($, on)
    await $.tool.call(wfCall())
    const before = { ...writes }
    const readBefore = { ...reads }
    for (let i = 0; i < 64; i += 1) {
      await $.agent.spawn(spawnWf(`verify:${i + 1}:logic`, { agentIndex: i + 1 }))
      expect(writes, `spawn ${i + 1}`).toEqual(before)
      expect(reads, `spawn ${i + 1}`).toEqual(readBefore)
    }
    await clock.advance(200)
    // The count itself reads the cards, so the reads above were being counted.
    expect(reads.engines ?? 0).toBeGreaterThan(readBefore.engines ?? 0)
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

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { closingOf } from '../hooks/report'
import {
  bash, commandRun, fakeRepo, notification, reply, ROOT, skill, spawnWf, turnEnd, WF, WF_LAUNCHED, WF_REPORT, wfCall,
} from './fake'
import type { Fake } from './fake'

// The state the visuals draw from, as register.tsx keeps it: the engine cards, the recorded closings, the
// steps a run has seen, the turn tags, the theme, and the findings' snippets. What draws from it is tested
// with each drawing.

const MINIMAL = { options: { visuals: 'minimal' } }

// A repo on a task branch with the engine's side of every event these tests raise, and a clock to move.
// Returns the fake's record, the clock, and the plugin's state as it wrote it: each value as last written
// (absent while never written), how many times it was, and every value in the order written.
async function world($: Engine, on: On, f: Fake = {}) {
  const seen = fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, results: { Workflow: WF_LAUNCHED }, ...f })
  const clock = mock.clock(on)
  const state: Record<string, unknown> = {}
  const writes: Record<string, number> = {}
  const written: Record<string, unknown[]> = {}
  on('state.set', ($, e, next) => {
    state[e.key] = e.value
    writes[e.key] = (writes[e.key] ?? 0) + 1
    written[e.key] = [...(written[e.key] ?? []), e.value]
    return next(e)
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'agent_test1' }))
  await $.tool.call(bash('git status'))
  return { seen, clock, state, writes, written }
}

const CLOSING = '**✓ Fixed** · nil address\n\n**Next**\n- `/laa:retro`: capture what we learned'

describe('engine cards', () => {
  test('a laa engine gets a card at launch, counts its agents by role, and takes its report', async ($, on) => {
    const { clock, state } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.tool.call(wfCall())
    expect(state.engines).toEqual({
      [WF.toolUseId]: { seq: 1, name: 'investigate', taskId: WF.taskId, runId: WF.runId, state: 'running', roles: {}, count: 0, result: null, status: null },
    })
    for (const label of ['investigate:logs', 'investigate:recent-changes', 'cluster', 'verify:1:logic', 'Unlabelled agent']) {
      await $.agent.spawn(spawnWf(label))
    }
    await clock.advance(200)
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { roles: { investigate: 2, cluster: 1, verify: 1 }, count: 5 } })
    await $.session.append(notification())
    expect(state.engines).toMatchObject({
      [WF.toolUseId]: { state: 'done', status: 'completed', result: WF_REPORT, count: 5 },
    })
  })

  test('counts a spawn that arrives before the launch answers', async ($, on) => {
    const { clock, state } = await world($, on, {
      duringTool: async (_, e) => {
        if (e.tool === 'Workflow') await $.agent.spawn(spawnWf('investigate:logs'))
      },
    })
    await $.tool.call(wfCall())
    await clock.advance(200)
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { roles: { investigate: 1 }, count: 1, runId: WF.runId } })
  })

  test('finds the card of a spawn that names only its run, and of one that names nothing while one engine runs', async ($, on) => {
    const { clock, state } = await world($, on)
    await $.tool.call(wfCall())
    await $.agent.spawn(spawnWf('investigate:logs', { toolUseId: '' }))
    await $.agent.spawn(spawnWf('verify:1:logic', { toolUseId: '', runId: '' }))
    await clock.advance(200)
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { roles: { investigate: 1, verify: 1 }, count: 2 } })
  })

  test('a burst of spawns is counted in one write, and a spawn itself writes nothing', async ($, on) => {
    const { clock, writes, state } = await world($, on)
    await $.tool.call(wfCall())
    const before = { ...writes }
    for (let i = 0; i < 64; i += 1) await $.agent.spawn(spawnWf(`verify:${i + 1}:logic`, { agentIndex: i + 1 }))
    expect(writes).toEqual(before)
    await clock.advance(200)
    expect((writes.engines ?? 0) - (before.engines ?? 0)).toBe(1)
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { roles: { verify: 64 }, count: 64 } })
  })

  test('a short burst is still counted when the first wait it asked for was refused', async ($, on) => {
    // A clock of this test's own, in place of `world`'s: the first wait asked of it is refused, as another
    // plugin's hook might; each later one comes due when the test says so.
    fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, results: { Workflow: WF_LAUNCHED } })
    const due: (() => void)[] = []
    let asked = 0
    on('clock.after', () => {
      asked += 1
      if (asked === 1) throw new Error('refused')
      return new Promise<{ value: undefined }>(resolve => due.push(() => resolve({ value: undefined })))
    })
    let cards: unknown
    on('state.set', ($, e, next) => {
      if (e.key === 'engines') cards = e.value
      return next(e)
    })
    on('agent.spawn', () => ({ model: 'claude-test', agentId: 'agent_test1' }))
    await $.tool.call(wfCall())
    for (let i = 0; i < 10; i += 1) await $.agent.spawn(spawnWf(`verify:${i + 1}:logic`, { agentIndex: i + 1 }))
    expect(asked).toBeGreaterThan(1)
    for (const fire of due) fire()
    // The count runs on its own once the wait is over: other calls pass until it has written.
    for (let i = 0; i < 20 && !(cards as Record<string, { count: number }>)[WF.toolUseId]?.count; i += 1) await $.tool.call(bash('echo waiting'))
    expect(cards).toMatchObject({ [WF.toolUseId]: { roles: { verify: 10 }, count: 10 } })
  })

  test('65 spawns before the first count are all counted', async ($, on) => {
    const { clock, state } = await world($, on)
    await $.tool.call(wfCall())
    for (let i = 0; i < 65; i += 1) await $.agent.spawn(spawnWf(`verify:${i + 1}:logic`, { agentIndex: i + 1 }))
    await clock.advance(200)
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { roles: { verify: 65 }, count: 65 } })
  })

  test('leaves other workflows, plain agents, and spawns with no engine running alone', async ($, on) => {
    const { clock, writes, state } = await world($, on)
    await $.tool.call(wfCall('nightly-report'))
    await $.agent.spawn(spawnWf('investigate:logs'))
    const { workflow: _none, ...plain } = spawnWf('investigate:logs')
    await $.agent.spawn(plain)
    await clock.advance(200)
    expect(state.engines).toBeUndefined()
    expect(writes.engines).toBeUndefined()
  })

  test('ends the card of the running engine when a notification names no card and carries no report', async ($, on) => {
    const { state } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.tool.call(wfCall())
    await $.session.append(notification('task t9 completed'))
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { state: 'ended', result: null, status: null } })
  })

  test('marks a failed engine, by its task when the notification names no call', async ($, on) => {
    const { state } = await world($, on)
    await $.tool.call(wfCall())
    await $.session.append(notification(`<task-id>${WF.taskId}</task-id>\n<status>failed</status>\n<summary>Workflow "investigate" failed</summary>`))
    expect(state.engines).toMatchObject({ [WF.toolUseId]: { state: 'failed', status: 'failed', result: null } })
  })

  test('keeps nothing under visuals: minimal', MINIMAL, async ($, on) => {
    const { clock, writes, state } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    await $.tool.call(wfCall())
    await $.agent.spawn(spawnWf('investigate:logs'))
    await clock.advance(200)
    await $.session.append(notification())
    await $.session.append(reply(CLOSING, 'row-2'))
    await $.turn.complete({ ...turnEnd(CLOSING), durationMs: 4321 })
    for (const key of ['engines', 'closings', 'turnTags', 'theme', 'filters']) expect(writes[key], key).toBeUndefined()
  })
})

describe('run history', () => {
  test('records the steps a run printed, and nothing for a run joined mid-way', async ($, on) => {
    const { state } = await world($, on)
    await $.skill.prompt(skill('fix'))
    expect(state.run).toMatchObject({ skill: 'fix', seen: [] })
    await $.session.append(reply('**▸ 0/7 · Load context**\n\n**▸ 1/7 · Triage the size**'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles', 'row-2'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles', 'row-3'))
    // A block's last step line is where the run stands; every step line in it counts as seen.
    expect(state.run).toMatchObject({ step: { n: 3 }, seen: [0, 1, 3] })

    await $.session.append(reply(CLOSING, 'row-4'))
    await $.session.append(reply('**▸ 6/7 · Review** · reviewer', 'row-5'))
    const revived = state.run as { skill: string; seen?: number[] }
    expect(revived.skill).toBe('fix')
    expect(revived.seen).toBeUndefined()
  })

  test('starts a run from its mode line with an empty history', async ($, on) => {
    const { state } = await world($, on)
    await $.session.append(reply('**laa:review** · 3 reviewers\n\n**▸ 1/4 · Resolve the target**'))
    expect(state.run).toMatchObject({ skill: 'review', seen: [1] })
  })

  test('records the status line of a closing report that ended a run, once', async ($, on) => {
    const { state } = await world($, on)
    await $.session.append(reply(CLOSING))
    expect(state.closings).toBeUndefined()

    await $.skill.prompt(skill('fix'))
    // A workflow's report (no Next) closes nothing.
    await $.session.append(reply('**✓ 2 of 3 root causes survived verification** · 5 angles', 'row-2'))
    expect(state.closings).toBeUndefined()
    await $.session.append(reply(`Done.\n\n${CLOSING}`, 'row-3'))
    await $.turn.complete(turnEnd(`Done.\n\n${CLOSING}`))
    // Recorded by its key: the status line, then a hash of what stands under it.
    expect(state.closings).toEqual([closingOf(CLOSING)?.key])
    expect(closingOf(CLOSING)?.key.startsWith('**✓ Fixed** · nil address #')).toBe(true)
  })

  test("keeps a turn's tag while its run goes on, and forgets everything on /clear", async ($, on) => {
    const { state } = await world($, on)
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'))
    await $.tool.call(wfCall('laa:design-panel'))
    await $.turn.complete({ ...turnEnd('**★ Approve the plan?** · 4 slices'), durationMs: 4321 })
    await $.session.append(reply(CLOSING, 'row-2'))
    // The closing turn's run is over by its end: it is kept with no tag, so it borrows no neighbour's.
    await $.turn.complete({ ...turnEnd(CLOSING), durationMs: 900 })
    expect(state.turnTags).toEqual([{ ms: 4321, tag: 'laa:feature ★' }, { ms: 900, tag: null }])
    expect(state.closings).toHaveLength(1)

    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} as never })
    expect(state.turnTags).toEqual([])
    expect(state.closings).toEqual([])
    expect(state.engines).toEqual({})
  })
})

describe('theme', () => {
  test("reads the person's theme when a laa skill starts, and writes it only when it changed", async ($, on) => {
    const { clock, writes, state } = await world($, on, { theme: 'dark-daltonized' })
    await $.skill.prompt(skill('fix'))
    await clock.settle()
    expect(state.theme).toBe('dark-daltonized')
    await $.skill.prompt(skill('review'))
    await clock.settle()
    expect(writes.theme).toBe(1)
  })

  test('goes without one when the settings menu cannot be read', async ($, on) => {
    const { clock, writes, state } = await world($, on)
    await $.skill.prompt(skill('fix'))
    await clock.settle()
    expect(state.theme).toBeUndefined()
    expect(writes.theme).toBeUndefined()
  })
})

// An invented review: two findings in one readable file (written with CRLF line ends), one in a file that
// is not there, one outside the repo, one in a file too large to read, and one with no line.
const SOURCE = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join('\r\n')
const REVIEW = [
  '# Review · fix/invoice-500 against main',
  '## HIGH · src/export/csv.go:2 · first',
  '- status: open',
  '## MED · src/export/csv.go:8 · second',
  '- status: open',
  '## LOW · src/export/gone.go:3 · missing file',
  '- status: open',
  '## LOW · ../other/secret.go:1 · outside the repo',
  '- status: open',
  '## LOW · src/export/huge.go:1 · too large',
  '- status: open',
  '## LOW · docs/setup.md · no line',
  '- status: open',
  '',
].join('\n')
const FILES = { '.claude/laa/local/last-review.md': REVIEW, 'src/export/csv.go': SOURCE, 'src/export/huge.go': 'x', 'docs/setup.md': 'text' }

// The review with a seventh finding, in a file of its own.
const REVIEW_7 = `${REVIEW}## MED · src/export/job.go:2 · no backoff\n- status: open\n`

// The world with that file in it, whose source files answer a read a second late.
async function slowWorld($: Engine, on: On) {
  const late: { sleep?: (ms: number) => Promise<void> } = {}
  const made = await world($, on, {
    files: { ...FILES, 'src/export/job.go': 'retry()\nbackoff()' },
    sizes: { 'src/export/huge.go': 2 * 1024 * 1024 },
    beforeRead: async path => {
      if (path.startsWith('src/')) await late.sleep?.(1000)
    },
  })
  late.sleep = ms => made.clock.sleep(ms)
  return made
}

describe('finding snippets', () => {
  test('loads the code around each finding it can read, each file once', async ($, on) => {
    const { seen, state } = await world($, on, { files: FILES, sizes: { 'src/export/huge.go': 2 * 1024 * 1024 } })
    await $.command.run(commandRun('laa-findings'))
    const shown = state.findings as { snippets: Record<number, unknown> }
    expect(shown.snippets).toEqual({
      0: { source: 'line 1\nline 2\nline 3\nline 4', startLine: 1, path: 'src/export/csv.go' },
      1: { source: 'line 6\nline 7\nline 8\nline 9', startLine: 6, path: 'src/export/csv.go' },
    })
    // The repo's root is asked where it lands, once; then each file under it, and nothing outside it.
    expect(seen.stats.toSorted()).toEqual(['.', 'src/export/csv.go', 'src/export/gone.go', 'src/export/huge.go'])
    expect(seen.reads.filter(p => p.startsWith('src/'))).toEqual(['src/export/csv.go'])
    expect(seen.reads.some(p => p.includes('secret'))).toBe(false)
  })

  test('reads no file and writes nothing again while neither the review nor the files it cites changed', async ($, on) => {
    const { seen, clock, writes, state } = await world($, on, { files: FILES, sizes: { 'src/export/huge.go': 2 * 1024 * 1024 } })
    await $.command.run(commandRun('laa-findings'))
    const before = { reads: seen.reads.filter(p => p.startsWith('src/')).length, findings: writes.findings }
    await $.turn.complete(turnEnd('Looked at the review.'))
    await $.turn.complete(turnEnd('Still looking.'))
    await clock.settle()
    // Each cited file is asked its age again, which is how an edit would show; none is read.
    expect({ reads: seen.reads.filter(p => p.startsWith('src/')).length, findings: writes.findings }).toEqual(before)

    // A changed review is loaded again; the file it points into is not read again while it has not changed.
    seen.setFile('.claude/laa/local/last-review.md', REVIEW.replace('- status: open', '- status: fixed (abc1234)'))
    await $.turn.complete(turnEnd('Fixed one.'))
    await clock.settle()
    const shown = state.findings as { entries: unknown[]; snippets: Record<number, unknown> }
    expect(shown.entries).toHaveLength(5)
    expect(Object.keys(shown.snippets)).toEqual(['1'])
    expect(writes.findings).toBe((before.findings ?? 0) + 1)
    expect(seen.reads.filter(p => p.startsWith('src/'))).toHaveLength(before.reads)
  })

  test('cuts the code again once a cited file is edited, though the review has not changed', async ($, on) => {
    const { seen, clock, writes, state } = await world($, on, { files: FILES, sizes: { 'src/export/huge.go': 2 * 1024 * 1024 } })
    await $.command.run(commandRun('laa-findings'))
    const before = { reads: seen.reads.filter(p => p.startsWith('src/')).length, findings: writes.findings ?? 0 }
    const snippets = () => (state.findings as { snippets: Record<number, { source: string }> }).snippets

    seen.setFile('src/export/csv.go', SOURCE.replace('line 2', 'if addr == nil {'))
    await $.turn.complete(turnEnd('Guarded the address.'))
    await clock.settle()
    expect(snippets()[0]?.source).toBe('line 1\nif addr == nil {\nline 3\nline 4')
    expect(snippets()[1]?.source).toBe('line 6\nline 7\nline 8\nline 9')
    expect(seen.reads.filter(p => p.startsWith('src/'))).toHaveLength(before.reads + 1)
    expect(writes.findings).toBe(before.findings + 1)

    // Opening the pane again finds an edit too, and has the code in hand when the command answers.
    seen.setFile('src/export/csv.go', SOURCE.replace('line 8', 'return rows'))
    await $.command.run(commandRun('laa-findings'))
    expect(snippets()[0]?.source).toBe('line 1\nline 2\nline 3\nline 4')
    expect(snippets()[1]?.source).toBe('line 6\nline 7\nreturn rows\nline 9')
  })

  test("a turn's end does not wait for the cited files: the entries show at once, the code when it is read", async ($, on) => {
    const { seen, clock, state } = await slowWorld($, on)
    const shown = () => state.findings as { entries: { index: number }[]; snippets: Record<number, { source: string }> }
    const opened = $.command.run(commandRun('laa-findings'))
    await clock.advance(1000)
    await opened
    expect(Object.keys(shown().snippets)).toEqual(['0', '1'])

    seen.setFile('.claude/laa/local/last-review.md', REVIEW_7)
    await $.turn.complete(turnEnd('Found one more.'))
    // The turn is over and the new entry is listed, with the code already known; its own is still being read.
    expect(shown().entries.map(f => f.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(Object.keys(shown().snippets)).toEqual(['0', '1'])
    await clock.advance(1000)
    expect(shown().snippets[6]?.source).toBe('retry()\nbackoff()')
  })

  test('code read for a review that has since been replaced is not written over the newer one', async ($, on) => {
    const { seen, clock, written } = await slowWorld($, on)
    seen.setFile('.claude/laa/local/last-review.md', REVIEW_7)
    const opened = $.command.run(commandRun('laa-findings'))
    await clock.advance(1000)
    await opened
    // A turn's end starts reading the edited job.go again; before the read answers, the review drops its finding.
    seen.setFile('src/export/job.go', 'retry()\nbackoff(attempt)')
    await $.turn.complete(turnEnd('Edited the job.'))
    seen.setFile('.claude/laa/local/last-review.md', REVIEW)
    await $.turn.complete(turnEnd('Dropped the finding.'))
    const count = written.findings?.length ?? 0
    await clock.advance(1000)
    // The late read is dropped: nothing is written after the review that no longer cites the file.
    expect(written.findings).toHaveLength(count)
    expect(Object.keys((written.findings?.at(-1) as { snippets: object }).snippets)).toEqual(['0', '1'])
  })

  test('loads none under visuals: minimal', MINIMAL, async ($, on) => {
    const { seen, state } = await world($, on, { files: FILES })
    await $.command.run(commandRun('laa-findings'))
    expect(state.findings).toEqual({
      repo: ROOT,
      entries: [0, 1, 2, 3, 4, 5].map(index => expect.objectContaining({ index })),
    })
    expect(seen.stats).toEqual([])
  })
})

import { describe as group, expect, test as run } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ALL_SURFACES, BAND, BAND_SURFACES, bash, commandRun, fakeRepo, FOOTER, golden, PANE, reply, show, skill } from './fake'
import type { Fake } from './fake'

// The 0.3.0 drawings, pinned: the band, the footer, and both panes, as the plugin hands them to each surface.
// Every tree here was captured from 0.3.0 before the visuals work began; a change to one is a change to
// what `visuals: minimal` promises to keep.
//
// Each group runs under `visuals: minimal`, where it must hold for good. The groups named in STUBBED also
// run under `visuals: full`, which draws the same while the drawing a group covers is still a stub: the slice
// that starts drawing it takes its name out of the list and pins the new drawing in its own test file.
const STUBBED = ['0.3.0 band', '0.3.0 footer']

const MODES = [
  { name: 'minimal', options: { visuals: 'minimal' } },
  { name: 'full', options: { visuals: 'full' } },
] as const

let mode: (typeof MODES)[number] = MODES[0]

// `describe` and `test` as the cases below use them: each group once per mode it is pinned in, each test
// with that mode as the plugin's setting. A group's body runs while it is declared, so `mode` is the group's.
const describe = (name: string, body: () => void) => {
  for (const m of MODES) {
    if (m.name === 'full' && !STUBBED.includes(name)) continue
    mode = m
    group(`${name} · visuals: ${m.name}`, body)
  }
}
const test = (name: string, body: TestBody) => run(name, { options: mode.options }, body)

const ENGINE_OWN = '<Box key="engine" />'

const open = (n: number) => Array.from({ length: n }, (_, i) => `## entry ${i}\n- status: open`).join('\n')

// A repo in the given state with the engine's own band, footer, and skill expansion beneath the plugin, and one
// git command so the plugin reads the repo. Returns the footer's labels as each draw handed them to the engine.
async function world($: Engine, on: On, f: Fake) {
  fakeRepo(on, f)
  const footers: string[][] = []
  on('ui.render', ($, e) => {
    if (e.component === 'SessionMode') footers.push([...e.props.modes])
    return $.ui.resolve(e).Box({ key: 'engine' })
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  await $.tool.call(bash('git status'))
  return footers
}

// The band on the terminal and the desktop: one tree for both.
async function expectBand($: Engine, want: string) {
  for (const surface of BAND_SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(show(await ui.drawn()), surface).toBe(golden(want))
    await ui.unmount()
  }
}

// A pane on all four surfaces: one tree for all.
async function expectPane($: Engine, target: typeof PANE.findings, want: string) {
  for (const surface of ALL_SURFACES) {
    const ui = await $.ui.mount({ ...target, surface })
    expect(show(await ui.drawn()), surface).toBe(golden(want))
    await ui.unmount()
  }
}

// Invented state files: a saved review with every tag (one already fixed), and learnings of both scopes.
const REVIEW = [
  '# Review · feat/export against main',
  '',
  '## CRIT · src/export/csv.go:14 · formula injection in exported cells',
  '- fix: prefix cells that start with =',
  '- status: open',
  '',
  '## HIGH · src/export/csv.go:52 · rows dropped past the first page',
  '- fix: follow the cursor until it is empty',
  '- status: open',
  '',
  '## MED · src/export/job.go:8 · job retried without backoff',
  '- status: open',
  '',
  '## LOW · src/export/job.go:30 · misleading log line',
  '- fix: name the tenant',
  '- status: open',
  '',
  '## HIGH · src/export/pdf.go:3 · unescaped file name',
  '- fix: escape it',
  '- status: fixed (abc1234)',
  '',
].join('\n')

const LEARNINGS = [
  '# Learnings',
  '',
  '## 2026-01-10 · laa:fix · wrong test command',
  '- scope: local',
  '- kind: wrong-assumption',
  '- target: project-map.md#testing',
  '- signal: tests need `make test-int`',
  '- proposal: fix the testing section',
  '- status: open',
  '',
  '## 2026-01-12 · laa:feature · missed migration',
  '- scope: generic',
  '- kind: missed-step',
  '- target: laa:feature step 6',
  '- signal: new column shipped without a migration',
  '- proposal: add a migration check',
  '- status: open',
  '',
].join('\n')

describe('0.3.0 band', () => {
  test('no run: the branch and a quiet nudge', async ($, on) => {
    await world($, on, { branch: 'feat/export', mapAge: 1, learnings: open(1) })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"feat/export"</Text>
        <Text dimColor>" · "</Text>
        <Text dimColor>"1 open learning"</Text>
      </Box>
    `)
  })

  test('stays out of a repo laa has not adopted', async ($, on) => {
    await world($, on, { isAdopted: false })
    await expectBand($, ENGINE_OWN)
  })

  test('yields to a survey', async ($, on) => {
    await world($, on, { branch: 'feat/export', mapAge: 1 })
    for (const surface of BAND_SURFACES) {
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface })
      expect(show(await ui.drawn()), surface).toBe(ENGINE_OWN)
      await ui.unmount()
    }
  })

  test('a run before its first step, then at a step', async ($, on) => {
    await world($, on, { branch: 'fix/invoice-500', mapAge: 1 })
    await $.skill.prompt(skill('fix'))
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"fix/invoice-500"</Text>
        <Text dimColor>" · "</Text>
        <Box key="run">
          <Text>"● laa:" "fix" ""</Text>
        </Box>
      </Box>
    `)
    await $.session.append(reply('**laa:fix** · standard · workflow mode\n\n**▸ 3/7 · Investigate** · 5 angles'))
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"fix/invoice-500"</Text>
        <Text dimColor>" · "</Text>
        <Box key="run">
          <Text>"● laa:" "fix" " ▸ 3/7 Investigate"</Text>
        </Box>
      </Box>
    `)
  })

  test('a running engine', async ($, on) => {
    await world($, on, { branch: 'fix/invoice-500', mapAge: 1 })
    await $.skill.prompt(skill('fix'))
    await $.session.append(reply('**▸ 3/7 · Investigate** · 5 angles'))
    await $.tool.call({ tool: 'Workflow', name: 'laa:investigate', args: { bug: 'x' } })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"fix/invoice-500"</Text>
        <Text dimColor>" · "</Text>
        <Box key="run">
          <Text>"● laa:" "fix" " ▸ 3/7 Investigate"</Text>
          <Text dimColor>" · engine " "investigate"</Text>
        </Box>
      </Box>
    `)
  })

  test('a gate waiting on the person', async ($, on) => {
    await world($, on, { branch: 'feat/export', mapAge: 1 })
    await $.skill.prompt(skill('feature'))
    await $.session.append(reply('**▸ 5/8 · Plan slices**\n\n**★ Approve the plan?** · 4 slices'))
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"feat/export"</Text>
        <Text dimColor>" · "</Text>
        <Text color="permission">"★ laa:" "feature" " · waiting on you: " "Approve the plan?"</Text>
      </Box>
    `)
  })

  test('a paused pipeline, with open high findings', async ($, on) => {
    await world($, on, {
      branch: 'feat/export',
      mapAge: 1,
      files: {
        '.claude/laa/local/runs/feat-export.md': '# laa:feature · feat/export\n- status: waiting\n- step: 5/8 · Plan slices\n- gate: ★ Approve the plan?\n',
        '.claude/laa/local/last-review.md': REVIEW,
      },
    })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"feat/export"</Text>
        <Text dimColor>" · "</Text>
        <Box key="paused">
          <Text dimColor>"○ paused laa:" "feature" " ▸ 5/8 Plan slices"</Text>
          <Text color="suggestion">" → /laa:resume"</Text>
        </Box>
        <Text dimColor>" · "</Text>
        <Box key="findings">
          <Text color="warning">"2 high findings" " open"</Text>
          <Text color="suggestion">" → /" "laa-findings"</Text>
        </Box>
      </Box>
    `)
  })

  test('a blocked default branch, then one the person allowed', async ($, on) => {
    await world($, on, { branch: 'main', mapAge: 1 })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text color="error">"✗ " "main" " · edits blocked"</Text>
      </Box>
    `)
    await $.command.run(commandRun('laa-allow-main'))
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text color="warning">"main" " · edits allowed"</Text>
      </Box>
    `)
  })

  test('the map nudge with no map, beside many open learnings', async ($, on) => {
    await world($, on, { branch: 'feat/export', learnings: open(4) })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"feat/export"</Text>
        <Text dimColor>" · "</Text>
        <Box key="learnings">
          <Text color="warning">"4 open learnings"</Text>
          <Text color="suggestion">" → /laa:evolve"</Text>
        </Box>
        <Text dimColor>" · "</Text>
        <Box key="map">
          <Text dimColor>"no project map"</Text>
          <Text color="suggestion">" → /laa:adopt "</Text>
          <Button hotkey="m" key="muteMap" label="mute" plain />
        </Box>
      </Box>
    `)
  })

  test('the map nudge for a stale map', async ($, on) => {
    await world($, on, { branch: 'feat/export', mapAge: 75 })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"feat/export"</Text>
        <Text dimColor>" · "</Text>
        <Box key="map">
          <Text color="warning">"project map " "75" " commits old"</Text>
          <Text color="suggestion">" → /laa:adopt "</Text>
          <Button hotkey="m" key="muteMap" label="mute" plain />
        </Box>
      </Box>
    `)
  })

  test('the map nudge for a muted map 100 commits stale', async ($, on) => {
    await world($, on, { branch: 'feat/export', mapAge: 120, store: { 'mutedMap:c:/r': true } })
    await expectBand($, `
      <Box key="laa">
        <Text dimColor>"laa · "</Text>
        <Text>"feat/export"</Text>
        <Text dimColor>" · "</Text>
        <Box key="map">
          <Text color="warning">"project map " "120" " commits old"</Text>
          <Text color="suggestion">" → /laa:adopt "</Text>
        </Box>
      </Box>
    `)
  })
})

describe('0.3.0 footer', () => {
  test('adds the run and where it stands to the mode labels', async ($, on) => {
    const footers = await world($, on, { branch: 'feat/export', mapAge: 1 })
    // What the plugin handed the engine on the terminal; the desktop gets the same labels, and both draw the engine's own row.
    const footer = async () => {
      for (const surface of BAND_SURFACES) {
        const ui = await $.ui.mount({ ...FOOTER, surface })
        expect(show(await ui.drawn()), surface).toBe(ENGINE_OWN)
        await ui.unmount()
      }
      expect(footers[footers.length - 1]).toEqual(footers[footers.length - 2])
      return footers[footers.length - 1]
    }
    expect(await footer()).toEqual(['auto-accept'])
    await $.skill.prompt(skill('feature'))
    expect(await footer()).toEqual(['auto-accept', 'laa:feature'])
    await $.session.append(reply('**▸ 5/8 · Plan slices** · 4 slices'))
    expect(await footer()).toEqual(['auto-accept', 'laa:feature 5/8'])
    await $.session.append(reply('**★ Approve the plan?** · 4 slices', 'row-2'))
    expect(await footer()).toEqual(['auto-accept', 'laa:feature ★'])
  })
})

describe('0.3.0 findings pane', () => {
  test('before it is loaded', async ($, on) => {
    await world($, on, { branch: 'feat/export' })
    await expectPane($, PANE.findings, `
      <Text dimColor>"Run /" "laa-findings" " to load the last review."</Text>
    `)
  })

  test('the open findings, each with its buttons', async ($, on) => {
    await world($, on, { branch: 'feat/export', files: { '.claude/laa/local/last-review.md': REVIEW } })
    await $.command.run(commandRun('laa-findings'))
    await expectPane($, PANE.findings, `
      <Box flexDirection="column">
        <Text dimColor>"C:/r"</Text>
        <Box flexDirection="column" key="finding0" marginTop=1>
          <Box>
            <Text bold color="error">"CRIT"</Text>
            <Text dimColor>"  src/export/csv.go:14"</Text>
          </Box>
          <Text>"formula injection in exported cells"</Text>
          <Text color="suggestion">"→ " "prefix cells that start with ="</Text>
          <Box>
            <Button key="fix0" label="Fix" />
            <Button key="dismiss0" label="Dismiss" />
          </Box>
        </Box>
        <Box flexDirection="column" key="finding1" marginTop=1>
          <Box>
            <Text bold color="error">"HIGH"</Text>
            <Text dimColor>"  src/export/csv.go:52"</Text>
          </Box>
          <Text>"rows dropped past the first page"</Text>
          <Text color="suggestion">"→ " "follow the cursor until it is empty"</Text>
          <Box>
            <Button key="fix1" label="Fix" />
            <Button key="dismiss1" label="Dismiss" />
          </Box>
        </Box>
        <Box flexDirection="column" key="finding2" marginTop=1>
          <Box>
            <Text bold color="warning">"MED "</Text>
            <Text dimColor>"  src/export/job.go:8"</Text>
          </Box>
          <Text>"job retried without backoff"</Text>
          ""
          <Box>
            <Button key="fix2" label="Fix" />
            <Button key="dismiss2" label="Dismiss" />
          </Box>
        </Box>
        <Box flexDirection="column" key="finding3" marginTop=1>
          <Box>
            <Text bold>"LOW "</Text>
            <Text dimColor>"  src/export/job.go:30"</Text>
          </Box>
          <Text>"misleading log line"</Text>
          <Text color="suggestion">"→ " "name the tenant"</Text>
          <Box>
            <Button key="fix3" label="Fix" />
            <Button key="dismiss3" label="Dismiss" />
          </Box>
        </Box>
        <Box marginTop=1>
          <Button hotkey="f" key="fixHigh" label="Fix all CRIT and HIGH (2)" variant="primary" />
        </Box>
      </Box>
    `)
  })

  test('a review with nothing open', async ($, on) => {
    await world($, on, { branch: 'feat/export', files: { '.claude/laa/local/last-review.md': '# Review\n' } })
    await $.command.run(commandRun('laa-findings'))
    await expectPane($, PANE.findings, `
      <Box flexDirection="column">
        <Text dimColor>"C:/r"</Text>
        <Text>"No open findings. Nothing to fix."</Text>
      </Box>
    `)
  })
})

describe('0.3.0 learnings pane', () => {
  test('before it is loaded', async ($, on) => {
    await world($, on, { branch: 'feat/export' })
    await expectPane($, PANE.learnings, `
      <Text dimColor>"Run /" "laa-learnings" " to load this repo's learnings."</Text>
    `)
  })

  test('the open learnings, each with its button', async ($, on) => {
    await world($, on, { branch: 'feat/export', learnings: LEARNINGS })
    await $.command.run(commandRun('laa-learnings'))
    await expectPane($, PANE.learnings, `
      <Box flexDirection="column">
        <Text dimColor>"C:/r"</Text>
        <Box flexDirection="column" key="entry0" marginTop=1>
          <Text bold>"2026-01-10 · laa:fix · wrong test command"</Text>
          <Text dimColor>"local" " · " "wrong-assumption" " · " "project-map.md#testing"</Text>
          <Text>"tests need \`make test-int\`"</Text>
          <Text color="suggestion">"→ " "fix the testing section"</Text>
          <Button key="reject0" label="Reject" />
        </Box>
        <Box flexDirection="column" key="entry1" marginTop=1>
          <Text bold>"2026-01-12 · laa:feature · missed migration"</Text>
          <Text dimColor>"generic" " · " "missed-step" " · " "laa:feature step 6"</Text>
          <Text>"new column shipped without a migration"</Text>
          <Text color="suggestion">"→ " "add a migration check"</Text>
          <Button key="reject1" label="Reject" />
        </Box>
        <Box marginTop=1>
          <Button hotkey="e" key="evolve" label="Evolve with /laa:evolve" variant="primary" />
        </Box>
      </Box>
    `)
  })

  test('nothing open', async ($, on) => {
    await world($, on, { branch: 'feat/export' })
    await $.command.run(commandRun('laa-learnings'))
    await expectPane($, PANE.learnings, `
      <Box flexDirection="column">
        <Text dimColor>"C:/r"</Text>
        <Text>"No open learnings. Nothing to evolve."</Text>
      </Box>
    `)
  })
})

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Finding, Learning, Learnings, Run, Status } from '../types'
import {
  commitDir, countOpenHigh, countOpenLearnings, ENGINES, gateOfQuestions, HELP, isUnder, journalFile, laaSkillOf,
  LOCAL_DIR, nextActionOf, parentOf, parseFindings, parseJournal, parseLearnings, PIPELINES, progressOf, rejectLearning,
  resolveFrom, REVIEW_FILE, setFindingStatus, slash, suggestionFor, TRACKED,
} from './git'
import type { Progress, Repo } from './git'

type Engine = EngineInterface

const status = atom({ plugin: 'laa-mods', key: 'status' } as const, null)
const allowMain = atom({ plugin: 'laa-mods', key: 'allowMain' } as const, false)
const learnings = atom({ plugin: 'laa-mods', key: 'learnings' } as const, null)
const findings = atom({ plugin: 'laa-mods', key: 'findings' } as const, null)
const pipeline = atom({ plugin: 'laa-mods', key: 'pipeline' } as const, null)
const run = atom({ plugin: 'laa-mods', key: 'run' } as const, null)
const nextUp = atom({ plugin: 'laa-mods', key: 'nextUp' } as const, null)
const learningsBefore = atom({ plugin: 'laa-mods', key: 'learningsBefore' } as const, null)

const ALLOW_COMMAND = 'laa-allow-main'
const HELP_COMMAND = 'laa-help'
const LEARNINGS_COMMAND = 'laa-learnings'
const FINDINGS_COMMAND = 'laa-findings'
const MAP_FILE = '.claude/laa/project-map.md'
const LEARNINGS_FILE = '.claude/laa/learnings.md'
const STALE_MAP = 50
// A muted map nudge comes back once the map is this many commits old.
const UNMUTE_MAP = 100
const LEARNINGS_PANE = 'laa-learnings'
const FINDINGS_PANE = 'laa-findings'
const RETRO = '/laa:retro'

// Out-of-band text (toasts, command output, pane titles) starts with this, so it reads as laa's own.
const PRE = 'laa · '

// The theme's semantic colors, so laa's marks follow the person's theme, colorblind themes included.
const C = { danger: 'error', warning: 'warning', action: 'suggestion', gate: 'permission' } as const

const denial = (repo: Repo, what: string) =>
  `laa: ${what} on the default branch \`${repo.branch}\` of ${repo.top} is blocked. ` +
  'Create a task branch first (`git switch -c feat/<slug>` or `fix/<slug>`), or a git worktree if the ' +
  'checkout has unrelated uncommitted changes. If the user explicitly wants this on the default branch, ' +
  `ask them to type /${ALLOW_COMMAND}; don't work around this block.`

const baseName = (p: string) => slash(p).split('/').pop() || p
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Refuses the call, and says so on screen as well as in the transcript.
function blocked($: Engine, repo: Repo, what: string, short: string) {
  $.ui.toast(`${PRE}blocked ${short} on ${repo.branch}. Create a task branch first.`)
  return { deny: denial(repo, what) }
}

async function git($: Engine, cwd: string, ...args: string[]) {
  const run = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 })
  return { ok: run.exitCode === 0, out: run.stdout.trim() }
}

async function readText($: Engine, path: string) {
  return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
}

// The repository a path belongs to, read from its nearest existing directory; null outside git.
async function repoAt($: Engine, path: string): Promise<Repo | null> {
  let dir = slash(path)
  for (let i = 0; i < 64 && !(await $.fs.exists(dir)); i += 1) {
    const up = parentOf(dir)
    if (up === dir) return null
    dir = up
  }
  const top = await git($, dir, 'rev-parse', '--show-toplevel')
  if (!top.ok || !top.out) return null
  const root = top.out
  const [branch, head, origin, isAdopted] = await Promise.all([
    git($, root, 'symbolic-ref', '-q', '--short', 'HEAD'),
    git($, root, 'rev-parse', '-q', '--verify', 'HEAD'),
    git($, root, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'),
    $.fs.exists(`${root}/.claude/laa`),
  ])
  const name = branch.ok && branch.out ? branch.out : null
  const defaults = origin.ok && origin.out ? [origin.out.replace(/^[^/]+\//, '')] : ['main', 'master']
  return { top: root, branch: name, hasCommits: head.ok, isDefault: name !== null && defaults.includes(name), isAdopted }
}

// The repo when the guard refuses changes to it, else null.
async function guarded($: Engine, guard: string, repo: Repo | null) {
  if (guard === 'off' || !repo) return null
  if (guard === 'adopted' && !repo.isAdopted) return null
  // A repo with no commits has nothing to branch from: its first commit goes on the default branch.
  if (!repo.isDefault || !repo.hasCommits) return null
  return (await read($, allowMain)) ? null : repo
}

async function guardFile($: Engine, guard: string, path: string) {
  const file = resolveFrom(await $.session.cwd(), path)
  const repo = await guarded($, guard, await repoAt($, parentOf(file)))
  if (!repo || !isUnder(file, repo.top) || isUnder(file, `${repo.top}/.git`)) return null
  // laa's local state ignores itself, but its .gitignore has to be written before git ignores anything there.
  if (isUnder(file, `${repo.top}/${LOCAL_DIR}`)) return null
  // Ignored files (local settings, build output) never reach a commit.
  if ((await git($, repo.top, 'check-ignore', '-q', '--', file)).ok) return null
  return blocked($, repo, `Changing ${file}`, `editing ${baseName(file)}`)
}

// Before a write to learnings.md, note how many were open, so the turn's end can say what it added.
async function noteLearnings($: Engine, path: string) {
  const file = resolveFrom(await $.session.cwd(), path)
  if (!slash(file).toLowerCase().endsWith(`/${LEARNINGS_FILE}`) || (await read($, learningsBefore)) !== null) return
  const before = countOpenLearnings(await readText($, file))
  await update($, learningsBefore, b => b ?? before)
}

const mutedKey = (top: string) => `mutedMap:${slash(top).toLowerCase()}`

async function statusOf($: Engine, repo: Repo): Promise<Status> {
  let mapAge: number | null = null
  if (await $.fs.exists(`${repo.top}/${MAP_FILE}`)) {
    const last = await git($, repo.top, 'log', '-1', '--format=%H', '--', MAP_FILE)
    const count = last.ok && last.out ? await git($, repo.top, 'rev-list', '--count', `${last.out}..HEAD`) : null
    mapAge = count?.ok ? Number(count.out) || 0 : 0
  }
  const journal = repo.branch ? parseJournal(await readText($, `${repo.top}/${journalFile(repo.branch)}`)) : null
  return {
    branch: repo.branch,
    isDefault: repo.isDefault && repo.hasCommits,
    openLearnings: countOpenLearnings(await readText($, `${repo.top}/${LEARNINGS_FILE}`)),
    mapAge,
    isMapMuted: Boolean(await $.store.get(mutedKey(repo.top))),
    openHigh: countOpenHigh(await readText($, `${repo.top}/${REVIEW_FILE}`)),
    paused: journal && journal.status !== 'done' && journal.branch === repo.branch ? journal : null,
  }
}

// Runs in the background after turns and git commands, so it never throws: a failed
// refresh leaves the band as it was.
async function refresh($: Engine) {
  try {
    const repo = await repoAt($, await $.session.cwd())
    const next = repo && repo.isAdopted ? await statusOf($, repo) : null
    await update($, status, () => next)
  } catch {
    // The module may have reloaded, or git may be missing; the next refresh tries again.
  }
}

// What a block of laa output says about the run: a mode line starts one, steps and gates move it,
// and the closing report (its Next list) ends it.
async function applyProgress($: Engine, p: Progress) {
  if (!p.skill && !p.step && !p.gate && !p.isClosing) return
  await update($, run, (r): Run | null => {
    if (p.isClosing) return null
    let next = r
    if (p.skill && TRACKED.includes(p.skill) && next?.skill !== p.skill) next = { skill: p.skill, step: null, gate: null, engine: null }
    if (!next) return null
    if (p.step) {
      const isSame = next.step?.n === p.step.n && next.step.last === p.step.last
      next = { ...next, step: p.step, gate: null, engine: isSame ? next.engine : null }
    }
    if (p.gate) next = { ...next, gate: p.gate }
    return next
  })
}

const textOf = (content: readonly unknown[]) =>
  content.map(b => (b && typeof b === 'object' && 'text' in b && typeof b.text === 'string' ? b.text : '')).join('\n')

async function loadLearnings($: Engine, top: string) {
  const next: Learnings = { repo: top, entries: parseLearnings(await readText($, `${top}/${LEARNINGS_FILE}`)) }
  await update($, learnings, () => next)
  return next
}

// The person pressed Reject in the pane: mark the entry rejected, as /laa:evolve does, and reload.
async function rejectEntry($: Engine, top: string, entry: Learning) {
  const path = `${top}/${LEARNINGS_FILE}`
  const next = rejectLearning(await readText($, path), entry.index, entry.title, 'dismissed in the laa-learnings pane')
  if (next === null) {
    $.ui.toast(`${PRE}learnings.md changed since the pane loaded it; reloaded.`)
  } else {
    await $.fs.write(path, next)
    $.ui.toast(`${PRE}rejected "${entry.title}"`)
  }
  await loadLearnings($, top)
  void refresh($)
}

async function startEvolve($: Engine) {
  const filled = await $.prompt.fill({ text: '/laa:evolve ', mode: 'replace' })
  $.ui.toast(filled.isFilled ? `${PRE}/laa:evolve is in the prompt. Press Enter to run it.` : `${PRE}type /laa:evolve to run it.`)
}

async function loadFindings($: Engine, top: string) {
  const next = { repo: top, entries: parseFindings(await readText($, `${top}/${REVIEW_FILE}`)) }
  await update($, findings, () => next)
  return next
}

// The person pressed Fix: put a self-contained request for the fix in the prompt, for them to send.
async function fixFindings($: Engine, entries: readonly Finding[]) {
  const what = entries.map(f => `${f.tag} ${f.location} ${f.title}${f.fix ? ` → ${f.fix}` : ''}`).join('; ')
  const text = entries.length === 1
    ? `Fix this finding from the last review, then mark it fixed in ${REVIEW_FILE}: ${what}`
    : `Fix these findings from the last review, then mark each one fixed in ${REVIEW_FILE}: ${what}`
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  $.ui.toast(filled.isFilled ? `${PRE}the fix is in the prompt. Press Enter to run it.` : `${PRE}the prompt is busy; try again from the pane.`)
}

// The person pressed Dismiss: mark the finding dismissed and reload.
async function dismissFinding($: Engine, top: string, finding: Finding) {
  const path = `${top}/${REVIEW_FILE}`
  const next = setFindingStatus(await readText($, path), finding.index, finding.location, 'dismissed (in the laa-findings pane)')
  if (next === null) {
    $.ui.toast(`${PRE}last-review.md changed since the pane loaded it; reloaded.`)
  } else {
    await $.fs.write(path, next)
    $.ui.toast(`${PRE}dismissed ${finding.tag} ${finding.location}`)
  }
  await loadFindings($, top)
  void refresh($)
}

async function muteMap($: Engine) {
  const repo = await repoAt($, await $.session.cwd())
  if (!repo) return
  await $.store.set(mutedKey(repo.top), true)
  $.ui.toast(`${PRE}project map nudge muted for ${baseName(repo.top)}. It comes back if a map goes ${UNMUTE_MAP} commits stale.`)
  await refresh($)
}

// Once per pipeline: propose /laa:retro as the prompt box's dim suggestion (Tab to take it).
async function suggestRetro($: Engine) {
  const p = await read($, pipeline)
  if (!p || p.isNudged) return
  const shown = await $.prompt.suggest({ text: RETRO })
  if (shown.isShown) await update($, pipeline, q => (q ? { ...q, isNudged: true } : q))
}

// Once per closing report: propose the first command of its Next list.
async function suggestNext($: Engine) {
  const n = await read($, nextUp)
  if (!n || n.isNudged) return
  const shown = await $.prompt.suggest({ text: n.text })
  if (shown.isShown) await update($, nextUp, q => (q ? { ...q, isNudged: true } : q))
}

const stepText = (s: Run['step']) => (s ? ` ▸ ${s.n}/${s.last} ${s.title}` : '')

// The state line /laa-help opens with.
const headerOf = (s: Status | null) => {
  if (!s) return `${PRE}no laa state in this repo`
  const map = s.mapAge === null ? 'no project map' : `map ${plural(s.mapAge, 'commit')} old`
  return `${PRE}${s.branch ?? 'detached HEAD'} · ${map} · ${plural(s.openLearnings, 'open learning')} · ${plural(s.openHigh, 'high finding')} open`
}

// /laa-help as Markdown: the command's transcript row, and what the model reads of it.
function helpText(s: Status | null, allowed: boolean) {
  const lines = [headerOf(s), '']
  for (const g of HELP) {
    lines.push(`**${g.group}**`)
    for (const [command, what] of g.items) lines.push(`- \`${command}\` ${what}`)
    lines.push('')
  }
  lines.push(`**Engines** (the entry skills run these; typed alone, each does one stage): ${ENGINES.join(' · ')}`)
  lines.push(`**Session** \`/${ALLOW_COMMAND}\`: edits on the default branch are ${allowed ? 'allowed' : 'blocked'}`)
  const suggested = suggestionFor(s, s !== null)
  if (suggested) lines.push('', `**Suggested** \`${suggested.command}\`: ${suggested.why}`)
  return lines.join('\n')
}

const tagColor = (tag: string) => (tag === 'CRIT' || tag === 'HIGH' ? C.danger : tag === 'MED' ? C.warning : undefined)

export const register: Register = (on, options) => {
  const guard = String(options.guard ?? 'adopted')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: HELP_COMMAND,
      description: `${PRE}every laa command by job, this repo's state, and what to run next`,
    })
    await $.command.register({
      name: ALLOW_COMMAND,
      description: `${PRE}allow or block edits and commits on the default branch for this session`,
    })
    await $.command.register({
      name: LEARNINGS_COMMAND,
      description: `${PRE}review the open learnings of this repo (or the repo at a path) in a pane`,
      argumentHint: '[repo path]',
    })
    await $.command.register({
      name: FINDINGS_COMMAND,
      description: `${PRE}work through the last /laa:review's open findings in a pane`,
      argumentHint: '[repo path]',
    })
    void refresh($)
    return next(e)
  })

  on('command.run', { command: ALLOW_COMMAND }, async $ => {
    const now = await update($, allowMain, was => !was)
    void refresh($)
    return {
      text: now
        ? `${PRE}edits and commits on the default branch are allowed for the rest of this session.`
        : `${PRE}edits and commits on the default branch are blocked again.`,
    }
  })

  on('command.run', { command: HELP_COMMAND }, async $ => {
    await refresh($)
    return { text: helpText(await read($, status), await read($, allowMain)) }
  })

  on('command.run', { command: LEARNINGS_COMMAND }, async ($, e) => {
    const where = e.args.trim() || (await $.session.cwd())
    const repo = await repoAt($, resolveFrom(await $.session.cwd(), where))
    if (!repo) return { text: `${PRE}${where} is not in a git repository.` }
    const list = await loadLearnings($, repo.top)
    const opened = await $.ui.open({ id: LEARNINGS_PANE, title: `${PRE}open learnings` })
    const count = `${plural(list.entries.length, 'open learning')} in ${repo.top}`
    return { text: opened.isPlaced ? `${PRE}${count}.` : `${PRE}${count}; widen the terminal to see the pane.` }
  })

  on('command.run', { command: FINDINGS_COMMAND }, async ($, e) => {
    const where = e.args.trim() || (await $.session.cwd())
    const repo = await repoAt($, resolveFrom(await $.session.cwd(), where))
    if (!repo) return { text: `${PRE}${where} is not in a git repository.` }
    if (!(await $.fs.exists(`${repo.top}/${REVIEW_FILE}`))) return { text: `${PRE}no saved review in ${repo.top}. Run /laa:review first.` }
    const list = await loadFindings($, repo.top)
    const opened = await $.ui.open({ id: FINDINGS_PANE, title: `${PRE}last review` })
    const count = `${plural(list.entries.length, 'open finding')} in ${repo.top}`
    return { text: opened.isPlaced ? `${PRE}${count}.` : `${PRE}${count}; widen the terminal to see the pane.` }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const refused = await guardFile($, guard, e.file_path)
    if (refused) return refused
    await noteLearnings($, e.file_path)
    return next(e)
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const refused = await guardFile($, guard, e.file_path)
    if (refused) return refused
    await noteLearnings($, e.file_path)
    return next(e)
  })
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => (await guardFile($, guard, e.notebook_path)) ?? next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const dir = commitDir(e.command)
    if (dir !== null) {
      const repo = await guarded($, guard, await repoAt($, resolveFrom(await $.session.cwd(), dir || '.')))
      if (repo) return blocked($, repo, 'Committing', 'a commit')
    }
    const ran = await next(e)
    // A pipeline that committed has done work worth a retro.
    if (dir !== null && !('deny' in ran) && !ran.isError) {
      await update($, pipeline, p => (p ? { ...p, hasCommitted: true } : p))
    }
    // Branch switches and commits change what the band shows; the model's next step sees it current.
    if (/\bgit\b/.test(e.command)) await refresh($)
    return ran
  })

  // A ★ gate asked through AskUserQuestion waits on the person until it's answered.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const gate = gateOfQuestions(e.questions)
    if (gate) await update($, run, r => (r ? { ...r, gate } : r))
    const answered = await next(e)
    if (gate) await update($, run, r => (r && r.gate === gate ? { ...r, gate: null } : r))
    return answered
  })

  // A workflow runs in the background: show its name until its notification arrives or the run moves on.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const ran = await next(e)
    const name = (e.name ?? '').replace(/^laa:/, '')
    if (name && !('deny' in ran) && !ran.isError) await update($, run, r => (r ? { ...r, engine: name } : r))
    return ran
  })

  // The model's own rows carry the run's mode, step, gate, and closing lines; a task notification ends the engine.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.agentId) return stored
    try {
      if (e.door === 'response' && e.message.type === 'assistant') {
        await applyProgress($, progressOf(textOf(e.message.content)))
      } else if (e.door === 'delivery') {
        const text = textOf(e.message.content)
        await update($, run, r => (r?.engine && text.includes(r.engine) ? { ...r, engine: null } : r))
      }
    } catch {
      // A row the band can't read leaves it as it was.
    }
    return stored
  })

  on('turn.complete', async ($, e, next) => {
    // Only the main loop's own answered turns; a suggestion is refused while the turn still runs, so wait for it to end.
    if (e.agentId || e.isAborted) {
      void refresh($)
      return next(e)
    }
    await applyProgress($, progressOf(e.answer))
    const command = nextActionOf(e.answer)
    await update($, nextUp, () => (command ? { text: command, isNudged: false } : null))

    const before = await read($, learningsBefore)
    if (before === null) {
      void refresh($)
    } else {
      await update($, learningsBefore, () => null)
      await refresh($)
      const after = (await read($, status))?.openLearnings ?? before
      if (after > before) $.ui.toast(`${PRE}${plural(after - before, 'learning')} logged · ${after} open · /${LEARNINGS_COMMAND}`)
    }

    const p = await read($, pipeline)
    if (p && p.hasCommitted && !p.isNudged) void $.clock.after(400, () => void suggestRetro($))
    else if (command) void $.clock.after(400, () => void suggestNext($))
    return next(e)
  })

  // A laa pipeline starting arms the retro nudge and the run the band tracks; the retro running disarms the nudge.
  on('skill.prompt', async ($, e, next) => {
    const skill = laaSkillOf(e.text)
    if (skill && PIPELINES.includes(skill)) {
      await update($, pipeline, () => ({ skill, hasCommitted: false, isNudged: false }))
    } else if (skill === 'retro') {
      await update($, pipeline, () => null)
    }
    if (skill && TRACKED.includes(skill)) await update($, run, () => ({ skill, step: null, gate: null, engine: null }))
    return next(e)
  })

  // When the engine proposes its own next prompt, propose the retro while it's due, else the last Next command.
  on('prompt.suggest', async ($, e, next) => {
    if (e.origin.kind !== 'suggestion') return next(e)
    const p = await read($, pipeline)
    if (p && p.hasCommitted && !p.isNudged) {
      const shown = await next({ ...e, text: RETRO })
      if (shown.isShown) await update($, pipeline, q => (q ? { ...q, isNudged: true } : q))
      return shown
    }
    const n = await read($, nextUp)
    if (n && !n.isNudged) {
      const shown = await next({ ...e, text: n.text })
      if (shown.isShown) await update($, nextUp, q => (q ? { ...q, isNudged: true } : q))
      return shown
    }
    return next(e)
  })

  // The footer's mode labels: the laa run and where it stands.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const r = await read($, run)
    if (!r) return next(e)
    const label = `laa:${r.skill}${r.gate ? ' ★' : r.step ? ` ${r.step.n}/${r.step.last}` : ''}`
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })

  // The band: at most one alarm (a blocked default branch), what's running or paused, then what's waiting, quietest last.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, status)
    if (e.props.hasSurvey || !s) return next(e)
    const r = await read($, run)
    const allowed = await read($, allowMain)
    const { Box, Button, Text } = $.ui.resolve(e)
    const parts = []
    if (s.branch) {
      if (s.isDefault && !allowed) parts.push(<Text key="branch" color={C.danger}>✗ {s.branch} · edits blocked</Text>)
      else if (s.isDefault) parts.push(<Text key="branch" color={C.warning}>{s.branch} · edits allowed</Text>)
      else parts.push(<Text key="branch">{s.branch}</Text>)
    }
    if (r?.gate) {
      parts.push(<Text key="run" color={C.gate}>★ laa:{r.skill} · waiting on you: {r.gate}</Text>)
    } else if (r) {
      parts.push(
        <Box key="run">
          <Text>● laa:{r.skill}{stepText(r.step)}</Text>
          {r.engine && <Text dimColor> · engine {r.engine}</Text>}
        </Box>,
      )
    } else if (s.paused) {
      parts.push(
        <Box key="paused">
          <Text dimColor>○ paused laa:{s.paused.skill}{stepText(s.paused.step)}</Text>
          <Text color={C.action}> → /laa:resume</Text>
        </Box>,
      )
    }
    if (s.openHigh > 0) {
      parts.push(
        <Box key="findings">
          <Text color={C.warning}>{plural(s.openHigh, 'high finding')} open</Text>
          <Text color={C.action}> → /{FINDINGS_COMMAND}</Text>
        </Box>,
      )
    }
    if (s.openLearnings >= 3) {
      parts.push(
        <Box key="learnings">
          <Text color={C.warning}>{plural(s.openLearnings, 'open learning')}</Text>
          <Text color={C.action}> → /laa:evolve</Text>
        </Box>,
      )
    } else if (s.openLearnings > 0) {
      parts.push(<Text key="learnings" dimColor>{plural(s.openLearnings, 'open learning')}</Text>)
    }
    const mute = <Button key="muteMap" label="mute" hotkey="m" plain onPress={() => muteMap($)} />
    if (s.mapAge === null && !s.isMapMuted) {
      parts.push(
        <Box key="map">
          <Text dimColor>no project map</Text>
          <Text color={C.action}> → /laa:adopt </Text>
          {mute}
        </Box>,
      )
    } else if (s.mapAge !== null && s.mapAge >= STALE_MAP && (!s.isMapMuted || s.mapAge >= UNMUTE_MAP)) {
      parts.push(
        <Box key="map">
          <Text color={C.warning}>project map {s.mapAge} commits old</Text>
          <Text color={C.action}> → /laa:adopt </Text>
          {!s.isMapMuted && mute}
        </Box>,
      )
    }
    return (
      <Box key="laa">
        <Text dimColor>laa · </Text>
        {parts.flatMap((p, i) => (i === 0 ? [p] : [<Text key={`sep${i}`} dimColor> · </Text>, p]))}
      </Box>
    )
  })

  // /laa-help's row: the same content as its text, with commands in the action color.
  on('ui.render', { component: 'CommandOutput', props: { command: HELP_COMMAND } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const s = await read($, status)
    const allowed = await read($, allowMain)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(...HELP.flatMap(g => g.items.map(([command]) => command.length)))
    const suggested = suggestionFor(s, s !== null)
    return (
      <Box key="laa-help" flexDirection="column">
        <Text dimColor>{headerOf(s)}</Text>
        {HELP.map(g => (
          <Box key={g.group} flexDirection="column" marginTop={1}>
            <Text bold>{g.group}</Text>
            {g.items.map(([command, what]) => (
              <Box key={command}>
                <Text color={C.action}>{`  ${command.padEnd(width)}`}</Text>
                <Text dimColor>{`  ${what}`}</Text>
              </Box>
            ))}
          </Box>
        ))}
        <Box key="engines" marginTop={1} flexDirection="column">
          <Text dimColor>{`Engines (the entry skills run these; typed alone, each does one stage): ${ENGINES.join(' · ')}`}</Text>
          <Text dimColor>{`Session: /${ALLOW_COMMAND} · edits on the default branch are ${allowed ? 'allowed' : 'blocked'}`}</Text>
        </Box>
        {suggested && (
          <Box key="suggested" marginTop={1}>
            <Text bold>Suggested </Text>
            <Text color={C.action}>{suggested.command}</Text>
            <Text dimColor>{`  ${suggested.why}`}</Text>
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: LEARNINGS_PANE }, async ($, e) => {
    const list = await read($, learnings)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (!list) return <Text dimColor>Run /{LEARNINGS_COMMAND} to load this repo's learnings.</Text>
    return (
      <Box flexDirection="column">
        <Text dimColor>{list.repo}</Text>
        {list.entries.length === 0 && <Text>No open learnings. Nothing to evolve.</Text>}
        {list.entries.map(entry => (
          <Box key={`entry${entry.index}`} flexDirection="column" marginTop={1}>
            <Text bold>{entry.title}</Text>
            <Text dimColor>{entry.scope} · {entry.kind} · {entry.target}</Text>
            <Text>{entry.signal}</Text>
            <Text color={C.action}>→ {entry.proposal}</Text>
            <Button key={`reject${entry.index}`} label="Reject" onPress={() => rejectEntry($, list.repo, entry)} />
          </Box>
        ))}
        {list.entries.length > 0 && (
          <Box marginTop={1}>
            <Button key="evolve" label="Evolve with /laa:evolve" variant="primary" hotkey="e" onPress={() => startEvolve($)} />
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: FINDINGS_PANE }, async ($, e) => {
    const list = await read($, findings)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (!list) return <Text dimColor>Run /{FINDINGS_COMMAND} to load the last review.</Text>
    const high = list.entries.filter(f => f.tag === 'CRIT' || f.tag === 'HIGH')
    return (
      <Box flexDirection="column">
        <Text dimColor>{list.repo}</Text>
        {list.entries.length === 0 && <Text>No open findings. Nothing to fix.</Text>}
        {list.entries.map(f => (
          <Box key={`finding${f.index}`} flexDirection="column" marginTop={1}>
            <Box>
              <Text bold color={tagColor(f.tag)}>{f.tag.padEnd(4)}</Text>
              <Text dimColor>{`  ${f.location}`}</Text>
            </Box>
            <Text>{f.title}</Text>
            {f.fix && <Text color={C.action}>→ {f.fix}</Text>}
            <Box>
              <Button key={`fix${f.index}`} label="Fix" onPress={() => fixFindings($, [f])} />
              <Button key={`dismiss${f.index}`} label="Dismiss" onPress={() => dismissFinding($, list.repo, f)} />
            </Box>
          </Box>
        ))}
        {high.length > 0 && (
          <Box marginTop={1}>
            <Button key="fixHigh" label={`Fix all CRIT and HIGH (${high.length})`} variant="primary" hotkey="f" onPress={() => fixFindings($, high)} />
          </Box>
        )}
      </Box>
    )
  })
}

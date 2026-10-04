import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Learning, Learnings, Status } from '../types'
import { commitDir, countOpenLearnings, isUnder, laaSkillOf, parentOf, parseLearnings, PIPELINES, rejectLearning, resolveFrom, slash } from './git'
import type { Repo } from './git'

type Engine = EngineInterface

const status = atom({ plugin: 'laa-mods', key: 'status' } as const, null)
const allowMain = atom({ plugin: 'laa-mods', key: 'allowMain' } as const, false)
const learnings = atom({ plugin: 'laa-mods', key: 'learnings' } as const, null)
const pipeline = atom({ plugin: 'laa-mods', key: 'pipeline' } as const, null)

const ALLOW_COMMAND = 'laa-allow-main'
const MAP_FILE = '.claude/laa/project-map.md'
const STALE_MAP = 50
const LEARNINGS_COMMAND = 'laa-learnings'
const LEARNINGS_FILE = '.claude/laa/learnings.md'
const PANE = 'laa-learnings'
const RETRO = '/laa:retro'

const denial = (repo: Repo, what: string) =>
  `laa: ${what} on the default branch \`${repo.branch}\` of ${repo.top} is blocked. ` +
  'Create a task branch first (`git switch -c feat/<slug>` or `fix/<slug>`), or a git worktree if the ' +
  'checkout has unrelated uncommitted changes. If the user explicitly wants this on the default branch, ' +
  `ask them to type /${ALLOW_COMMAND}; don't work around this block.`

const baseName = (p: string) => slash(p).split('/').pop() || p

// Refuses the call, and says so on screen as well as in the transcript.
function blocked($: Engine, repo: Repo, what: string, short: string) {
  $.ui.toast(`laa: blocked ${short} on ${repo.branch}. Create a task branch first.`)
  return { deny: denial(repo, what) }
}

async function git($: Engine, cwd: string, ...args: string[]) {
  const run = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 })
  return { ok: run.exitCode === 0, out: run.stdout.trim() }
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
  // Ignored files (local settings, build output) never reach a commit.
  if ((await git($, repo.top, 'check-ignore', '-q', '--', file)).ok) return null
  return blocked($, repo, `Changing ${file}`, `editing ${baseName(file)}`)
}

async function statusOf($: Engine, repo: Repo): Promise<Status> {
  const learnings = `${repo.top}/.claude/laa/learnings.md`
  const text = (await $.fs.exists(learnings)) ? String(await $.fs.read(learnings)) : ''
  let mapAge: number | null = null
  if (await $.fs.exists(`${repo.top}/${MAP_FILE}`)) {
    const last = await git($, repo.top, 'log', '-1', '--format=%H', '--', MAP_FILE)
    const count = last.ok && last.out ? await git($, repo.top, 'rev-list', '--count', `${last.out}..HEAD`) : null
    mapAge = count?.ok ? Number(count.out) || 0 : 0
  }
  return {
    branch: repo.branch,
    isDefault: repo.isDefault && repo.hasCommits,
    openLearnings: countOpenLearnings(text),
    mapAge,
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

async function loadLearnings($: Engine, top: string) {
  const path = `${top}/${LEARNINGS_FILE}`
  const text = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  const next: Learnings = { repo: top, entries: parseLearnings(text) }
  await update($, learnings, () => next)
  return next
}

// The person pressed Reject in the pane: mark the entry rejected, as /laa:evolve does, and reload.
async function rejectEntry($: Engine, top: string, entry: Learning) {
  const path = `${top}/${LEARNINGS_FILE}`
  const text = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  const next = rejectLearning(text, entry.index, entry.title, 'dismissed in the laa-learnings pane')
  if (next === null) {
    $.ui.toast('laa: learnings.md changed since the pane loaded it; reloaded.')
  } else {
    await $.fs.write(path, next)
    $.ui.toast(`laa: rejected "${entry.title}"`)
  }
  await loadLearnings($, top)
  void refresh($)
}

async function startEvolve($: Engine) {
  const filled = await $.prompt.fill({ text: '/laa:evolve ', mode: 'replace' })
  $.ui.toast(filled.isFilled ? 'laa: /laa:evolve is in the prompt. Press Enter to run it.' : 'laa: type /laa:evolve to run it.')
}

// Once per pipeline: propose /laa:retro as the prompt box's dim suggestion (Tab to take it).
async function suggestRetro($: Engine) {
  const p = await read($, pipeline)
  if (!p || p.isNudged) return
  const shown = await $.prompt.suggest({ text: RETRO })
  if (shown.isShown) await update($, pipeline, q => (q ? { ...q, isNudged: true } : q))
}

export const register: Register = (on, options) => {
  const guard = String(options.guard ?? 'adopted')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: ALLOW_COMMAND,
      description: 'laa: allow or block edits and commits on the default branch for this session',
    })
    await $.command.register({
      name: LEARNINGS_COMMAND,
      description: 'laa: review the open learnings of this repo (or the repo at a path) in a pane',
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
        ? 'laa: edits and commits on the default branch are allowed for the rest of this session.'
        : 'laa: edits and commits on the default branch are blocked again.',
    }
  })

  on('command.run', { command: LEARNINGS_COMMAND }, async ($, e) => {
    const where = e.args.trim() || (await $.session.cwd())
    const repo = await repoAt($, resolveFrom(await $.session.cwd(), where))
    if (!repo) return { text: `laa: ${where} is not in a git repository.` }
    const list = await loadLearnings($, repo.top)
    const opened = await $.ui.open({ id: PANE, title: 'laa · open learnings' })
    const count = `${list.entries.length} open learning${list.entries.length === 1 ? '' : 's'} in ${repo.top}`
    return { text: opened.isPlaced ? `laa: ${count}.` : `laa: ${count}; widen the terminal to see the pane.` }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => (await guardFile($, guard, e.file_path)) ?? next(e))
  on('tool.call', { tool: 'Write' }, async ($, e, next) => (await guardFile($, guard, e.file_path)) ?? next(e))
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

  on('turn.complete', async ($, e, next) => {
    void refresh($)
    const p = await read($, pipeline)
    // Only the main loop's own answered turns; a suggestion is refused while the turn still runs, so wait for it to end.
    if (!e.agentId && !e.isAborted && p && p.hasCommitted && !p.isNudged) {
      void $.clock.after(400, () => void suggestRetro($))
    }
    return next(e)
  })

  // A laa pipeline starting arms the nudge; the retro running disarms it.
  on('skill.prompt', async ($, e, next) => {
    const skill = laaSkillOf(e.text)
    if (skill && PIPELINES.includes(skill)) {
      await update($, pipeline, () => ({ skill, hasCommitted: false, isNudged: false }))
    } else if (skill === 'retro') {
      await update($, pipeline, () => null)
    }
    return next(e)
  })

  // When the engine proposes its own next prompt while the nudge is due, propose the retro instead.
  on('prompt.suggest', async ($, e, next) => {
    const p = await read($, pipeline)
    if (e.origin.kind !== 'suggestion' || !p || !p.hasCommitted || p.isNudged) return next(e)
    const shown = await next({ ...e, text: RETRO })
    if (shown.isShown) await update($, pipeline, q => (q ? { ...q, isNudged: true } : q))
    return shown
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, status)
    if (e.props.hasSurvey || !s) return next(e)
    const allowed = await read($, allowMain)
    const { Box, Text } = $.ui.resolve(e)
    const parts = []
    if (s.branch) {
      const note = s.isDefault ? (allowed ? ' (default branch, edits allowed)' : ' (default branch, edits blocked)') : ''
      parts.push(<Text key="branch" color={s.isDefault ? 'yellow' : undefined}>{s.branch}{note}</Text>)
    }
    if (s.openLearnings > 0) {
      const many = s.openLearnings >= 3
      parts.push(
        <Text key="learnings" color={many ? 'yellow' : undefined}>
          {s.openLearnings} open learning{s.openLearnings === 1 ? '' : 's'}{many ? ' · /laa:evolve' : ''}
        </Text>,
      )
    }
    if (s.mapAge === null) {
      parts.push(<Text key="map" color="yellow">no project map · /laa:adopt</Text>)
    } else if (s.mapAge >= STALE_MAP) {
      parts.push(<Text key="map" color="yellow">project map {s.mapAge} commits old · /laa:adopt</Text>)
    }
    return (
      <Box key="laa">
        <Text dimColor>laa · </Text>
        {parts.flatMap((p, i) => (i === 0 ? [p] : [<Text key={`sep${i}`} dimColor> · </Text>, p]))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
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
            <Text color="cyan">→ {entry.proposal}</Text>
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
}

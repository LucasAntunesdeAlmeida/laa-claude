import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Status } from '../types'
import { commitDir, countOpenLearnings, isUnder, parentOf, resolveFrom, slash } from './git'
import type { Repo } from './git'

type Engine = EngineInterface

const status = atom({ plugin: 'laa-mods', key: 'status' } as const, null)
const allowMain = atom({ plugin: 'laa-mods', key: 'allowMain' } as const, false)

const ALLOW_COMMAND = 'laa-allow-main'
const MAP_FILE = '.claude/laa/project-map.md'
const STALE_MAP = 50

const denial = (repo: Repo, what: string) =>
  `laa: ${what} on the default branch \`${repo.branch}\` of ${repo.top} is blocked. ` +
  'Create a task branch first (`git switch -c feat/<slug>` or `fix/<slug>`), or a git worktree if the ' +
  'checkout has unrelated uncommitted changes. If the user explicitly wants this on the default branch, ' +
  `ask them to type /${ALLOW_COMMAND}; don't work around this block.`

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
  return { deny: denial(repo, `Changing ${file}`) }
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

export const register: Register = (on, options) => {
  const guard = String(options.guard ?? 'adopted')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: ALLOW_COMMAND,
      description: 'laa: allow or block edits and commits on the default branch for this session',
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

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => (await guardFile($, guard, e.file_path)) ?? next(e))
  on('tool.call', { tool: 'Write' }, async ($, e, next) => (await guardFile($, guard, e.file_path)) ?? next(e))
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => (await guardFile($, guard, e.notebook_path)) ?? next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const dir = commitDir(e.command)
    if (dir !== null) {
      const repo = await guarded($, guard, await repoAt($, resolveFrom(await $.session.cwd(), dir || '.')))
      if (repo) return { deny: denial(repo, 'Committing') }
    }
    const ran = await next(e)
    // Branch switches and commits change what the band shows; the model's next step sees it current.
    if (/\bgit\b/.test(e.command)) await refresh($)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($)
    return next(e)
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
}

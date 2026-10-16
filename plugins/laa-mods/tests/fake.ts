import { mock } from 'claude-code/testing'
import type { EngineInterface, On } from 'claude-code'

// An invented repo at C:/r, faked beneath the plugin: git answers, the file system, the store, and the session's directory.
export type Fake = {
  branch?: string | null
  hasCommits?: boolean
  isAdopted?: boolean
  origin?: string
  ignored?: string[]
  learnings?: string
  mapAge?: number
  // Other files in the repo, by their path relative to it, or by an absolute one (C:/main/...).
  files?: Record<string, string>
  store?: Record<string, unknown>
  // The session's directory; the repo's root unless given.
  cwd?: string
  // The repo is a git worktree of this main checkout (whose .git is the common git directory).
  worktreeOf?: string
  // Symbolic links: the link's path, and where it leads.
  links?: Record<string, string>
  // How git fails: it isn't there (every run rejects), or every run times out (and rejects).
  git?: 'missing' | 'timeout'
  // The file system refuses every exists check, so the plugin can't tell where anything is.
  isFsDown?: boolean
  // Runs inside every tool call the plugin lets through, before the tool answers: what a test reads mid-call.
  duringTool?: ($: EngineInterface, e: { tool: string }) => Promise<void>
}

export const ROOT = 'C:/r'
const LEARNINGS = `${ROOT}/.claude/laa/learnings.md`
// The engine hands paths to the fakes in the platform's spelling (C:\r on Windows), and a drive letter in either case.
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^[a-z]:/, d => d.toUpperCase())

export function fakeRepo(on: On, f: Fake = {}) {
  const branch = f.branch === undefined ? 'main' : f.branch
  const hasCommits = f.hasCommits ?? true
  const isAdopted = f.isAdopted ?? true
  const dirs = new Set([ROOT, `${ROOT}/src`, 'C:/other'])
  // Adopted: laa's committed state is there (learnings.md, empty unless the test gives it).
  if (isAdopted) dirs.add(`${ROOT}/.claude/laa`).add(LEARNINGS)
  if (f.mapAge !== undefined) dirs.add(`${ROOT}/.claude/laa/project-map.md`)
  const texts = new Map<string, string>()
  if (f.learnings !== undefined) texts.set(LEARNINGS, f.learnings)
  for (const [path, text] of Object.entries(f.files ?? {})) texts.set(/^[A-Z]:\//.test(path) ? path : `${ROOT}/${path}`, text)
  if (f.worktreeOf) dirs.add(f.worktreeOf)

  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = { ...ok(), exitCode: 1 }
  // Where a path lands once its links are followed.
  const real = (path: string) => {
    const p = norm(path)
    for (const [link, to] of Object.entries(f.links ?? {})) if (p === link || p.startsWith(`${link}/`)) return to + p.slice(link.length)
    return p
  }
  const exists = (path: string) => dirs.has(real(path)) || texts.has(real(path))

  mock.store(on, f.store)
  on('session.cwd', () => ({ value: f.cwd ?? ROOT }))
  on('fs.exists', ($, e) => (f.isFsDown ? { deny: 'EIO' } : { value: exists(e.path) }))
  on('fs.stat', ($, e) => {
    if (!exists(e.path)) return { deny: `ENOENT: ${e.path}` }
    const isLink = real(e.path) !== norm(e.path)
    const stat = { kind: dirs.has(real(e.path)) ? ('dir' as const) : ('file' as const), size: 0, mtimeMs: 0, isLink }
    return { value: e.resolve ? { ...stat, realPath: real(e.path) } : stat }
  })
  // The files as the plugin last wrote them, and every toast it showed.
  const seen = {
    get learnings() {
      return texts.get(LEARNINGS) ?? ''
    },
    file: (path: string) => texts.get(`${ROOT}/${path}`) ?? '',
    // What a tool the plugin let through would have written.
    setFile: (path: string, text: string) => void texts.set(`${ROOT}/${path}`, text),
    toasts: [] as string[],
    // Every git command the plugin ran, as `<cwd>: <args>`.
    git: [] as string[],
  }
  on('fs.read', ($, e) => ({ value: texts.get(norm(e.path)) ?? '' }))
  on('fs.write', ($, e) => {
    texts.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const cwd = norm(e.init?.cwd ?? ROOT)
    const args = e.argv.slice(1).join(' ')
    seen.git.push(`${cwd}: ${args}`)
    // $.process.run rejects when the program can't start or overruns its timeout.
    if (f.git === 'missing') return { deny: 'spawn git ENOENT' }
    if (f.git === 'timeout') return { deny: 'git timed out after 5000 ms' }
    const inRepo = real(cwd) === ROOT || real(cwd).startsWith(`${ROOT}/`)
    if (!inRepo) return { value: { ...fail, exitCode: 128 } }
    if (args === 'rev-parse --show-toplevel') return { value: ok(ROOT) }
    if (args === 'rev-parse --path-format=absolute --git-common-dir') return { value: ok(`${f.worktreeOf ?? ROOT}/.git`) }
    if (args === 'symbolic-ref -q --short HEAD') return { value: branch ? ok(branch) : fail }
    if (args === 'rev-parse -q --verify HEAD') return { value: hasCommits ? ok('abc123') : fail }
    if (args === 'symbolic-ref -q --short refs/remotes/origin/HEAD') return { value: f.origin ? ok(f.origin) : fail }
    if (args.startsWith('check-ignore')) return { value: f.ignored?.includes(norm(e.argv[e.argv.length - 1] ?? '')) ? ok() : fail }
    if (args.startsWith('log -1')) return { value: ok('def456') }
    if (args.startsWith('rev-list --count')) return { value: ok(String(f.mapAge ?? 0)) }
    return { value: fail }
  })
  // The tool itself: reached only when the plugin lets the call through.
  on('tool.call', async ($, e) => {
    await f.duringTool?.($, e)
    // A workflow launches in the background; a run from a script file names it by the script's meta name.
    if (e.tool === 'Workflow') return { result: { status: 'async_launched', taskId: 'task-1', workflowName: e.name ?? 'laa:map-repo' } as never }
    return { result: 'ran' as never }
  })
  return seen
}

export const edit = (file_path: string) => ({ tool: 'Edit' as const, file_path, old_string: 'a', new_string: 'b' })
export const write = (file_path: string, content = 'x') => ({ tool: 'Write' as const, file_path, content })
// A plugin's deny reaches the engine's $.tool.call as { deny }; anything else means the tool ran.
export const denied = (res: object) => 'deny' in res
export const bash = (command: string) => ({ tool: 'Bash' as const, command })
export const powershell = (command: string) => ({ tool: 'PowerShell' as const, command })
export const notebook = (notebook_path: string) => ({ tool: 'NotebookEdit' as const, notebook_path, new_source: 'x = 1' })
export const allowMainRun = {
  command: 'laa-allow-main',
  args: '',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 120 },
}

// A command run as the person typed it, in the fullscreen layout.
export const commandRun = (command: string, args = '') => ({
  command,
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
})

// The model's reply as the session stores it: one assistant row of text.
export const reply = (text: string, uuid = 'row-1') => ({
  message: { type: 'assistant' as const, role: 'assistant' as const, content: [{ type: 'text' as const, text }] },
  door: 'response' as const,
  origin: { kind: 'model' as const, model: 'claude-test' },
  uuid,
})

// The end of a main-loop turn that answered with `answer`.
export const turnEnd = (answer: string, extra: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer,
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...extra,
})

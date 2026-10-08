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
  // Other files in the repo, by their path relative to it.
  files?: Record<string, string>
  store?: Record<string, unknown>
  // The session's directory; the repo's root unless given.
  cwd?: string
  // Runs inside every tool call the plugin lets through, before the tool answers: what a test reads mid-call.
  duringTool?: ($: EngineInterface, e: { tool: string }) => Promise<void>
}

export const ROOT = 'C:/r'
const LEARNINGS = `${ROOT}/.claude/laa/learnings.md`
// The engine hands paths to the fakes in the platform's spelling (C:\r on Windows).
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

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
  for (const [path, text] of Object.entries(f.files ?? {})) texts.set(`${ROOT}/${path}`, text)

  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = { ...ok(), exitCode: 1 }

  mock.store(on, f.store)
  on('session.cwd', () => ({ value: f.cwd ?? ROOT }))
  on('fs.exists', ($, e) => ({ value: dirs.has(norm(e.path)) || texts.has(norm(e.path)) }))
  // The files as the plugin last wrote them, and every toast it showed.
  const seen = {
    get learnings() {
      return texts.get(LEARNINGS) ?? ''
    },
    file: (path: string) => texts.get(`${ROOT}/${path}`) ?? '',
    // What a tool the plugin let through would have written.
    setFile: (path: string, text: string) => void texts.set(`${ROOT}/${path}`, text),
    toasts: [] as string[],
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
    const inRepo = cwd === ROOT || cwd.startsWith(`${ROOT}/`)
    if (!inRepo) return { value: { ...fail, exitCode: 128 } }
    if (args === 'rev-parse --show-toplevel') return { value: ok(ROOT) }
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
    return { result: 'ran' as never }
  })
  return seen
}

export const edit = (file_path: string) => ({ tool: 'Edit' as const, file_path, old_string: 'a', new_string: 'b' })
export const write = (file_path: string, content = 'x') => ({ tool: 'Write' as const, file_path, content })
// A plugin's deny reaches the engine's $.tool.call as { deny }; anything else means the tool ran.
export const denied = (res: object) => 'deny' in res
export const bash = (command: string) => ({ tool: 'Bash' as const, command })
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

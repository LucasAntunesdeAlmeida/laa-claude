import type { On } from 'claude-code'

// An invented repo at C:/r, faked beneath the plugin: git answers, the file system and the session's directory.
export type Fake = {
  branch?: string | null
  hasCommits?: boolean
  isAdopted?: boolean
  origin?: string
  ignored?: string[]
  learnings?: string
  mapAge?: number
}

export const ROOT = 'C:/r'
// The engine hands paths to the fakes in the platform's spelling (C:\r on Windows).
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

export function fakeRepo(on: On, f: Fake = {}) {
  const branch = f.branch === undefined ? 'main' : f.branch
  const hasCommits = f.hasCommits ?? true
  const isAdopted = f.isAdopted ?? true
  const files = new Set([ROOT, `${ROOT}/src`, 'C:/other'])
  if (isAdopted) files.add(`${ROOT}/.claude/laa`)
  if (f.learnings !== undefined) files.add(`${ROOT}/.claude/laa/learnings.md`)
  if (f.mapAge !== undefined) files.add(`${ROOT}/.claude/laa/project-map.md`)

  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = { ...ok(), exitCode: 1 }

  on('session.cwd', () => ({ value: ROOT }))
  on('fs.exists', ($, e) => ({ value: files.has(norm(e.path)) }))
  on('fs.read', () => ({ value: f.learnings ?? '' }))
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
  on('tool.call', () => ({ result: 'ran' as never }))
}

export const edit = (file_path: string) => ({ tool: 'Edit' as const, file_path, old_string: 'a', new_string: 'b' })
// A plugin's deny reaches the engine's $.tool.call as { deny }; anything else means the tool ran.
export const denied = (res: object) => 'deny' in res
export const bash = (command: string) => ({ tool: 'Bash' as const, command })
export const allowMainRun = {
  command: 'laa-allow-main',
  args: '',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 120 },
}

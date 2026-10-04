// Pure helpers: paths, commands, and learnings text. Everything that calls the engine is in register.tsx.

export type Repo = {
  top: string
  branch: string | null
  hasCommits: boolean
  isDefault: boolean
  isAdopted: boolean
}

export const slash = (p: string) => p.replace(/\\/g, '/')

export const isAbsolute = (p: string) => /^([a-zA-Z]:)?[\\/]/.test(p)

// The parent directory; a root ("/", "C:/") is its own parent.
export const parentOf = (p: string) => {
  const s = slash(p).replace(/\/+$/, '')
  if (s === '' || /^[a-zA-Z]:$/.test(s)) return `${s}/`
  const i = s.lastIndexOf('/')
  if (i < 0) return s
  const up = s.slice(0, i)
  return up === '' || /^[a-zA-Z]:$/.test(up) ? `${up}/` : up
}

export const resolveFrom = (cwd: string, p: string) =>
  isAbsolute(p) ? slash(p) : `${slash(cwd).replace(/\/+$/, '')}/${slash(p)}`

// git prints "C:/x" on Windows while tools may pass "c:\x"; compare paths case-insensitively there.
export const isUnder = (file: string, dir: string) => {
  const norm = (p: string) => (/^[a-zA-Z]:/.test(p) ? slash(p).toLowerCase() : slash(p))
  return norm(file).startsWith(`${norm(dir).replace(/\/+$/, '')}/`)
}

const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, '$2')

// Where a shell command runs `git commit`, if it does: the `-C` directory, else the
// directory of a leading `cd`, else '' for the session's directory. null when it doesn't commit.
export const commitDir = (command: string): string | null => {
  const commit = /(?:^|[;&|(\n]\s*|\s)git((?:\s+-[cC]\s+(?:"[^"]*"|'[^']*'|\S+))*)\s+commit\b/.exec(command)
  if (!commit) return null
  const dashC = /-C\s+("[^"]*"|'[^']*'|\S+)/.exec(commit[1] ?? '')
  if (dashC?.[1]) return unquote(dashC[1])
  const cd = /^\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)/.exec(command)
  return cd?.[1] ? unquote(cd[1]) : ''
}

export const countOpenLearnings = (text: string) =>
  text.split(/\r?\n/).filter(line => /^- status: open\b/.test(line)).length

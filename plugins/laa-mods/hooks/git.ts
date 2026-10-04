// Pure helpers: paths, commands, and learnings text. Everything that calls the engine is in register.tsx.

import type { Learning } from '../types'

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

// Which laa skill a skill prompt is, from the heading every laa skill starts with ("# /laa:fix").
export const laaSkillOf = (prompt: string) => /^#\s*\/laa:([a-z-]+)\b/m.exec(prompt)?.[1] ?? null

export const PIPELINES = ['fix', 'feature', 'migrate', 'build']

export const countOpenLearnings = (text: string) =>
  text.split(/\r?\n/).filter(line => /^- status: open\b/.test(line)).length

// The [start, end) offsets of each `## ` entry in learnings.md, in file order.
const entrySpans = (text: string) => {
  const starts = [...text.matchAll(/^## /gm)].map(m => m.index ?? 0)
  return starts.map((start, i) => [start, starts[i + 1] ?? text.length] as const)
}

const field = (block: string, name: string) =>
  new RegExp(`^- ${name}:[ \\t]*(.*?)\\s*$`, 'm').exec(block)?.[1] ?? ''

// The open entries, in the laa:retro format.
export const parseLearnings = (text: string): Learning[] =>
  entrySpans(text).flatMap(([start, end], index) => {
    const block = text.slice(start, end)
    if (!/^open\b/.test(field(block, 'status'))) return []
    const title = (/^## (.*?)\s*$/m.exec(block)?.[1] ?? '').trim()
    return [{
      index,
      title,
      scope: field(block, 'scope'),
      kind: field(block, 'kind'),
      target: field(block, 'target'),
      signal: field(block, 'signal'),
      proposal: field(block, 'proposal'),
    }]
  })

// The file with entry `index` marked rejected, or null when that entry is no longer the open one titled `title`.
export const rejectLearning = (text: string, index: number, title: string, reason: string) => {
  const span = entrySpans(text)[index]
  if (!span) return null
  const block = text.slice(span[0], span[1])
  const open = parseLearnings(block)[0]
  if (!open || open.title !== title) return null
  const marked = block.replace(/^- status:[ \t]*open\b.*$/m, `- status: rejected (${reason})`)
  return text.slice(0, span[0]) + marked + text.slice(span[1])
}

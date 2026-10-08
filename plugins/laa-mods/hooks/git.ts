// Pure helpers: paths, commands, and the text of laa's state files and output lines.
// Everything that calls the engine is in register.tsx.

import type { Finding, Journal, Learning, Status, Step } from '../types'

export type Repo = {
  top: string
  // The main checkout: `top` itself, or the checkout a git worktree belongs to.
  main: string
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

// A path with its `.` and `..` segments collapsed, so a prefix check can't be walked out of.
export const normalize = (p: string) => {
  const [, root = '', rest = ''] = /^((?:[a-zA-Z]:)?\/?)(.*)$/.exec(slash(p)) ?? []
  const parts: string[] = []
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return root + parts.join('/')
}

export const resolveFrom = (cwd: string, p: string) =>
  normalize(isAbsolute(p) ? p : `${slash(cwd).replace(/\/+$/, '')}/${slash(p)}`)

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

// Pipelines that end with a retro, and the skills whose runs the band tracks step by step.
export const PIPELINES = ['fix', 'feature', 'migrate', 'build']
export const TRACKED = [...PIPELINES, 'review', 'adopt', 'forge', 'evolve', 'resume']

// laa's local state (never committed: the folder ignores itself), and the files in it.
export const LOCAL_DIR = '.claude/laa/local'
export const REVIEW_FILE = `${LOCAL_DIR}/last-review.md`
export const journalFile = (branch: string) => `${LOCAL_DIR}/runs/${branch.replace(/[\\/]/g, '-')}.md`

export const countOpenLearnings = (text: string) =>
  text.split(/\r?\n/).filter(line => /^- status: open\b/.test(line)).length

// The [start, end) offsets of each `## ` entry in a state file, in file order.
const entrySpans = (text: string) => {
  const starts = [...text.matchAll(/^## /gm)].map(m => m.index ?? 0)
  return starts.map((start, i) => [start, starts[i + 1] ?? text.length] as const)
}

const field = (block: string, name: string) =>
  new RegExp(`^- ${name}:[ \\t]*(.*?)\\s*$`, 'm').exec(block)?.[1] ?? ''

const isOpen = (block: string) => /^open\b/.test(field(block, 'status'))

// The file with entry `index` set to `status`, or null when that entry is no longer the open one `title` names.
const setStatus = (text: string, index: number, matches: (block: string) => boolean, status: string) => {
  const span = entrySpans(text)[index]
  if (!span) return null
  const block = text.slice(span[0], span[1])
  if (!isOpen(block) || !matches(block)) return null
  const marked = block.replace(/^- status:[ \t]*open\b.*$/m, `- status: ${status}`)
  return text.slice(0, span[0]) + marked + text.slice(span[1])
}

const titleOf = (block: string) => (/^## (.*?)\s*$/m.exec(block)?.[1] ?? '').trim()

// The open entries, in the laa:retro format.
export const parseLearnings = (text: string): Learning[] =>
  entrySpans(text).flatMap(([start, end], index) => {
    const block = text.slice(start, end)
    if (!isOpen(block)) return []
    return [{
      index,
      title: titleOf(block),
      scope: field(block, 'scope'),
      kind: field(block, 'kind'),
      target: field(block, 'target'),
      signal: field(block, 'signal'),
      proposal: field(block, 'proposal'),
    }]
  })

// The file with entry `index` marked rejected, or null when that entry is no longer the open one titled `title`.
export const rejectLearning = (text: string, index: number, title: string, reason: string) =>
  setStatus(text, index, block => titleOf(block) === title, `rejected (${reason})`)

// One entry of last-review.md: `## <CRIT|HIGH|MED|LOW> · <file>:<line> · <title>`, backticks around the tag
// or the location tolerated, and a location that may hold spaces.
const FINDING = /^## `?(CRIT|HIGH|MED|LOW)`? · `?(.+?)`? · (.+?)\s*$/m

// The open findings of the last review, in file order.
export const parseFindings = (text: string): Finding[] =>
  entrySpans(text).flatMap(([start, end], index) => {
    const block = text.slice(start, end)
    const m = FINDING.exec(block)
    if (!m || !isOpen(block)) return []
    return [{ index, tag: m[1] ?? '', location: m[2] ?? '', title: m[3] ?? '', fix: field(block, 'fix') }]
  })

export const countOpenHigh = (text: string) => parseFindings(text).filter(f => f.tag === 'CRIT' || f.tag === 'HIGH').length

// The file with finding `index` set to `status`, or null when it's no longer the open finding at `location`.
export const setFindingStatus = (text: string, index: number, location: string, status: string) =>
  setStatus(text, index, block => FINDING.exec(block)?.[2] === location, status)

// Of `entries`, those still open in the file as it is now.
export const stillOpen = (text: string, entries: readonly Finding[]) => {
  const open = parseFindings(text)
  return entries.filter(f => open.some(o => o.index === f.index && o.location === f.location))
}

const stepOf = (n: string | undefined, last: string | undefined, title: string | undefined): Step | null =>
  n && last && title ? { n: Number(n), last: Number(last), title: title.trim() } : null

// A run's journal; null when the text isn't one.
export const parseJournal = (text: string): Journal | null => {
  const head = /^# laa:([a-z-]+) · (.+?)\s*$/m.exec(text)
  if (!head) return null
  const step = /^- step: (\d+)\/(\d+) · (.+?)\s*$/m.exec(text)
  const gate = field(text, 'gate').replace(/^★\s*/, '')
  return {
    skill: head[1] ?? '',
    branch: head[2] ?? '',
    status: field(text, 'status') || 'running',
    step: stepOf(step?.[1], step?.[2], step?.[3]),
    gate: gate && gate !== 'none' ? gate : null,
  }
}

// What a block of laa output says about its run, from the output contract's lines:
// `**laa:<skill>** · …` (mode), `**▸ n/last · Title**` (step), `**★ Question**` (gate), and `**Next**` (the closing report).
export type Progress = { skill: string | null; step: Step | null; gate: string | null; isClosing: boolean }

export const progressOf = (text: string): Progress => {
  const steps = [...text.matchAll(/\*\*▸ (\d+)\/(\d+) · ([^*\n]+?)\*\*/g)]
  const last = steps[steps.length - 1]
  const gates = [...text.matchAll(/^\*\*★ ([^*\n]+?)\*\*/gm)]
  return {
    skill: /^\*\*laa:([a-z-]+)\*\* · /m.exec(text)?.[1] ?? null,
    step: stepOf(last?.[1], last?.[2], last?.[3]),
    gate: gates[gates.length - 1]?.[1]?.trim() ?? null,
    // A closing report: a ✓ or ✗ status line, then a Next list. A workflow report alone (no Next) doesn't close a run.
    isClosing: /^\*\*[✓✗] [^\n]*\n[\s\S]*^\*\*Next\*\*\s*$/m.test(text),
  }
}

// The first laa command in a closing report's Next list (`/laa:retro`, `/laa-findings`), if it has one.
export const nextActionOf = (text: string) => {
  const at = text.search(/^\*\*Next\*\*\s*$/m)
  if (at < 0) return null
  return /`(\/laa[:-][a-z-]+(?: [^`\n]*)?)`/.exec(text.slice(at))?.[1]?.trim() ?? null
}

// The ★ question among an AskUserQuestion call's questions, without the star.
export const gateOfQuestions = (questions: readonly { question: string }[]) =>
  questions.map(q => q.question.trim()).find(q => q.startsWith('★'))?.replace(/^★\s*/, '') ?? null

// Every laa command by the job it does, for /laa-help. CI checks that each laa skill is listed.
export const HELP: readonly { group: string; items: readonly (readonly [string, string])[] }[] = [
  { group: 'Understand', items: [['/laa:explore <question>', 'how the code works, read-only']] },
  {
    group: 'Change',
    items: [
      ['/laa:fix <bug>', 'reproduce → investigate → fix → review'],
      ['/laa:feature <desc>', 'explore → design → slices ★ → review'],
      ['/laa:migrate <change>', 'pilot → recipe ★ → batches ★ → sweep'],
      ['/laa:build <idea>', 'PRD ★ → architecture ★ → plan ★ → milestones ★'],
    ],
  },
  { group: 'Check', items: [['/laa:review [ref] [--fix]', 'every reviewer, each finding verified'], ['/laa-findings', 'work through the last review in a pane']] },
  { group: 'Continue', items: [['/laa:resume [branch]', 'pick a pipeline up from its journal']] },
  { group: 'Set up', items: [['/laa:adopt', 'map the repo and wire the toolkit'], ['/laa:forge <need>', 'one repo-specific agent, skill, workflow, or hook']] },
  { group: 'Learn', items: [['/laa:retro', 'capture what we learned'], ['/laa:evolve', 'turn learnings into approved diffs'], ['/laa-learnings', 'triage open learnings in a pane']] },
]

// The workflows the entry skills run; typed alone they do one stage only.
export const ENGINES = ['investigate', 'design-panel', 'review-panel', 'implement-slices', 'migrate-sites', 'map-repo']

// The one command most worth running next in this repo, and why; null when nothing is due.
export const suggestionFor = (s: Status | null, isAdopted: boolean): { command: string; why: string } | null => {
  if (!isAdopted) return { command: '/laa:adopt', why: 'laa has not mapped this repo yet' }
  if (!s) return null
  if (s.paused) {
    const at = s.paused.step ? ` at ${s.paused.step.n}/${s.paused.step.last} ${s.paused.step.title}` : ''
    return { command: '/laa:resume', why: `laa:${s.paused.skill} stopped${at} on ${s.paused.branch}` }
  }
  if (s.openHigh > 0) return { command: '/laa-findings', why: `${s.openHigh} CRIT or HIGH review findings are still open` }
  if (s.openLearnings >= 3) return { command: '/laa:evolve', why: `${s.openLearnings} learnings are waiting` }
  if (s.mapAge === null && !s.isMapMuted) return { command: '/laa:adopt', why: 'there is no project map yet' }
  if (s.mapAge !== null && s.mapAge >= 50 && (!s.isMapMuted || s.mapAge >= 100)) {
    return { command: '/laa:adopt', why: `the project map is ${s.mapAge} commits old` }
  }
  return null
}

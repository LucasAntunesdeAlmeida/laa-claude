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
  // Where the repo is: ROOT (a Windows drive path) unless given, e.g. POSIX_ROOT.
  root?: string
  // The repo is a git worktree of this main checkout (whose .git is the common git directory).
  worktreeOf?: string
  // Symbolic links to directories: the link's absolute path, and where it leads.
  links?: Record<string, string>
  // How git fails: it isn't there (every run rejects), or it starts (`git --version` answers) but every
  // other run times out (and rejects).
  git?: 'missing' | 'timeout'
  // Only the git runs whose arguments start with this time out.
  rejects?: string
  // The file system refuses every exists check, so the plugin can't tell where anything is.
  isFsDown?: boolean
  // Runs inside every tool call the plugin lets through, before the tool answers: what a test reads mid-call.
  duringTool?: ($: EngineInterface, e: { tool: string }) => Promise<void>
  // What a tool the plugin lets through answers, by the tool's name; 'ran' unless given.
  results?: Record<string, unknown>
  // The person's theme, as the settings menu lists it; with none the menu can't be read.
  theme?: string
  // Sizes in bytes of files too large to write out in a test, by their path relative to the repo.
  sizes?: Record<string, number>
  // Runs inside every read before it answers, with the path relative to the repo: how a test makes a read slow.
  beforeRead?: (path: string) => Promise<void>
  // Symbolic links to files in the repo, by their path relative to it: where each lands (an absolute path) and the text there.
  linkedFiles?: Record<string, { to: string; text: string }>
  // Where the repo's root really is, when the root as git names it is itself reached through a link.
  realRoot?: string
}

export const ROOT = 'C:/r'
// A repo the way Linux and macOS spell it, for tests that pass `root: POSIX_ROOT`.
export const POSIX_ROOT = '/home/me/r'

// The engine hands paths to the fakes in the platform's spelling (C:\r on Windows), and a drive letter in either case.
// Off Windows a drive path isn't absolute, so the engine resolves it against its own directory (/work/C:/r): keep
// what follows the drive. On Windows a POSIX path gains the current drive (C:/home/me/r): drop it for a POSIX repo.
const normFor = (posix: boolean) => (p: string) => {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const drive = s.match(/(?:^|\/)([a-zA-Z]:(?:\/.*)?)$/)
  const d = drive ? drive[1]!.replace(/^[a-z]:/, c => c.toUpperCase()) : s
  return posix ? d.replace(/^[A-Z]:(?=\/)/, '') : d
}

export function fakeRepo(on: On, f: Fake = {}) {
  const root = f.root ?? ROOT
  const posix = root.startsWith('/')
  const norm = normFor(posix)
  const LEARNINGS = `${root}/.claude/laa/learnings.md`
  const other = posix ? root.replace(/\/[^/]+$/, '/other') : 'C:/other'
  const branch = f.branch === undefined ? 'main' : f.branch
  const hasCommits = f.hasCommits ?? true
  const isAdopted = f.isAdopted ?? true
  const dirs = new Set([root, `${root}/src`, other])
  // Adopted: laa's committed state is there (learnings.md, empty unless the test gives it).
  if (isAdopted) dirs.add(`${root}/.claude/laa`).add(LEARNINGS)
  if (f.mapAge !== undefined) dirs.add(`${root}/.claude/laa/project-map.md`)
  const texts = new Map<string, string>()
  // How many times each file's text has changed, which is its age: an edit shows in the file's `mtimeMs`.
  const ages = new Map<string, number>()
  const put = (path: string, text: string) => {
    if (texts.get(path) !== text) ages.set(path, (ages.get(path) ?? 0) + 1)
    texts.set(path, text)
  }
  if (f.learnings !== undefined) put(LEARNINGS, f.learnings)
  for (const [path, text] of Object.entries(f.files ?? {})) put(/^([A-Z]:)?\//.test(path) ? path : `${root}/${path}`, text)
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
  on('session.cwd', () => ({ value: f.cwd ?? root }))
  // Where a file link leads: its target, which holds the link's text.
  const fileLinks = new Map<string, string>()
  for (const [path, link] of Object.entries(f.linkedFiles ?? {})) {
    fileLinks.set(`${root}/${path}`, norm(link.to))
    put(norm(link.to), link.text)
  }
  // Where a path lands: a file link's target, else the path with its directory links followed.
  const landing = (path: string) => fileLinks.get(norm(path)) ?? real(path)
  // Where a path lands, as `realPath` spells it: under `realRoot` for what the repo itself holds.
  const realOf = (path: string) => {
    const at = landing(path)
    const isInRepo = at === root || at.startsWith(`${root}/`)
    return f.realRoot !== undefined && isInRepo ? f.realRoot + at.slice(root.length) : at
  }
  on('fs.exists', ($, e) => (f.isFsDown ? { deny: 'EIO' } : { value: dirs.has(real(e.path)) || texts.has(landing(e.path)) }))
  // The files as the plugin last wrote them, and every toast it showed.
  const seen = {
    get learnings() {
      return texts.get(LEARNINGS) ?? ''
    },
    file: (path: string) => texts.get(`${root}/${path}`) ?? '',
    // What a tool the plugin let through would have written.
    setFile: (path: string, text: string) => put(`${root}/${path}`, text),
    toasts: [] as string[],
    // Every git command the plugin ran, as `<cwd>: <args>`.
    git: [] as string[],
    // Every path the plugin read or asked the size of, in order, relative to the repo where it is inside it.
    reads: [] as string[],
    stats: [] as string[],
  }
  // A path as the tests name it: relative to the repo ('.' for its root), whether spelled under the root or
  // under `realRoot`; as given when it is outside both.
  const relative = (path: string) => {
    const p = norm(path)
    for (const base of [root, ...(f.realRoot === undefined ? [] : [f.realRoot])]) {
      if (p === base) return '.'
      if (p.startsWith(`${base}/`)) return p.slice(base.length + 1)
    }
    return p
  }
  // A path as the files are kept: a `realRoot` spelling back under the root, a link followed.
  const kept = (path: string) => {
    const p = norm(path)
    const isReal = f.realRoot !== undefined && (p === f.realRoot || p.startsWith(`${f.realRoot}/`))
    return landing(isReal ? root + p.slice((f.realRoot ?? '').length) : p)
  }
  on('fs.read', async ($, e) => {
    seen.reads.push(relative(e.path))
    await f.beforeRead?.(relative(e.path))
    return { value: texts.get(kept(e.path)) ?? '' }
  })
  // A file's size and age, a directory, and where either lands when asked; a path that is neither is left to
  // the kit, which rejects it as a missing path is rejected.
  on('fs.stat', ($, e, next) => {
    seen.stats.push(relative(e.path))
    const at = kept(e.path)
    const isLink = fileLinks.has(norm(e.path)) || real(e.path) !== norm(e.path)
    const where = { isLink, ...(e.resolve ? { realPath: realOf(at) } : {}) }
    const text = texts.get(at)
    if (text !== undefined) return { value: { kind: 'file' as const, size: f.sizes?.[relative(e.path)] ?? text.length, mtimeMs: ages.get(at) ?? 1, ...where } }
    if (dirs.has(at)) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 1, ...where } }
    return next(e)
  })
  if (f.theme !== undefined) {
    const theme = f.theme
    on('config.list', () => ({
      value: [{ key: 'theme', label: 'Theme', kind: 'choice' as const, value: theme, provider: { plugin: 'engine', tier: 'core' as const }, isLocked: false }],
    }))
  }
  on('fs.write', ($, e) => {
    put(norm(e.path), e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const cwd = norm(e.init?.cwd ?? root)
    const args = e.argv.slice(1).join(' ')
    seen.git.push(`${cwd}: ${args}`)
    // $.process.run rejects when the program can't start or overruns its timeout.
    if (f.git === 'missing') return { deny: 'spawn git ENOENT' }
    if (args === '--version') return { value: ok('git version 2.99.0') }
    if (f.git === 'timeout' || (f.rejects !== undefined && args.startsWith(f.rejects))) return { deny: 'git timed out after 5000 ms' }
    const inRepo = real(cwd) === root || real(cwd).startsWith(`${root}/`)
    if (!inRepo) return { value: { ...fail, exitCode: 128 } }
    if (args === 'rev-parse --show-toplevel') return { value: ok(root) }
    if (args === 'rev-parse --path-format=absolute --git-common-dir') return { value: ok(`${f.worktreeOf ?? root}/.git`) }
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
    if (f.results?.[e.tool] !== undefined) return { result: f.results[e.tool] as never }
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

// A message the person typed and sent, as the session stores it.
export const typed = (text: string, uuid = 'row-p1') => ({
  message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'text' as const, text }] },
  door: 'prompt' as const,
  origin: { kind: 'composer' as const },
  uuid,
})

// The person's answer to an AskUserQuestion dialog, as the session stores it: the tool's result row.
export const asked = (answer: string, uuid = 'row-a1') => ({
  message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 'toolu_ask1', content: answer }] },
  door: 'tool-result' as const,
  origin: { kind: 'tool' as const, tool: 'AskUserQuestion' },
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

// What each site hands a render hook, as the engine does on a 120-column terminal with nothing going on.
export const BAND = {
  plugin: 'laa-mods',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} },
}
export const FOOTER = { plugin: 'laa-mods', component: 'SessionMode' as const, props: { modes: ['auto-accept'] } }
const pane = (requestId: string, title: string) => ({
  plugin: 'laa-mods',
  component: 'Pane' as const,
  requestId,
  props: { title, bodyColumns: 80, isFocused: false, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} },
})
export const PANE = { findings: pane('laa-findings', 'laa · last review'), learnings: pane('laa-learnings', 'laa · open learnings') }
export const SPINNER = {
  plugin: 'laa-mods',
  component: 'Spinner' as const,
  props: { word: 'Working', message: null as string | null, suffix: '…', mode: 'responding' as const },
}
export const HINT = {
  plugin: 'laa-mods',
  component: 'PromptHint' as const,
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
}
export const TURN = { plugin: 'laa-mods', component: 'TurnDuration' as const, props: { word: 'Baked', durationMs: 1000 } }

// The surfaces each site is raised on.
export const BAND_SURFACES = ['terminal', 'desktop'] as const
export const ALL_SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

// A laa skill's prompt as the engine expands it.
export const skill = (name: string) => ({ skill: `laa:${name}`, text: `# /laa:${name}\n\nBug: something\n` })

// Invented ids of one engine launch: the Workflow call, the background task, and the run.
export const WF = { toolUseId: 'toolu_test1', taskId: 'task_test1', runId: 'wf_test1' }

// What the Workflow tool answers a launch with; a test passes it as `results: { Workflow: WF_LAUNCHED }`.
export const WF_LAUNCHED = { status: 'async_launched' as const, taskId: WF.taskId, runId: WF.runId, workflowName: 'investigate' }

// The model launching a workflow.
export const wfCall = (name = 'laa:investigate', tool_use_id = WF.toolUseId) =>
  ({ tool: 'Workflow' as const, name, args: { bug: 'x' }, tool_use_id })

// A workflow's script starting one agent, by the agent's label. `ids` overrides which call and run it names.
export const spawnWf = (label: string, ids: { toolUseId?: string; runId?: string; agentIndex?: number } = {}) => ({
  tool_use_id: ids.toolUseId ?? WF.toolUseId,
  prompt: 'Do the task.',
  description: label,
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-test',
  background: true,
  fork: false,
  workflow: { runId: ids.runId ?? WF.runId, agentIndex: ids.agentIndex ?? 1 },
})

// The first line of the report in the notification below, as an engine card shows it.
export const WF_REPORT = '✓ 2 of 3 root causes survived verification · 5 angles'

// What stands between a notification's tags for the launch above: it completed, with a workflow result that carries a report.
export const WF_DONE = [
  `<task-id>${WF.taskId}</task-id>`,
  `<tool-use-id>${WF.toolUseId}</tool-use-id>`,
  '<status>completed</status>',
  '<summary>Workflow "investigate" completed</summary>',
  `<result>${JSON.stringify({ report: '**✓ 2 of 3 root causes survived verification** · 5 angles\n- ✓ `a.go:1` nil address' })}</result>`,
].join('\n')

// The row a finished background task adds to the conversation, with `body` between its tags.
export const notification = (body = WF_DONE, uuid = 'row-n1') => ({
  message: {
    type: 'user' as const,
    role: 'user' as const,
    isMeta: true as const,
    content: [{ type: 'text' as const, text: `<task-notification>\n${body}\n</task-notification>` }],
  },
  door: 'delivery' as const,
  origin: { kind: 'engine' as const },
  uuid,
})

// A drawn tree, or one node of it.
export type Drawn = string | { type: string; props?: Record<string, unknown>; children?: readonly unknown[] }

// A Text's props as the plugin set them. The plugin styles strong text with `weight`; some surfaces hand the
// tree back with `bold: true` beside it, which says the same thing, so it is left out where `weight` is set.
export const styleOf = (props: Record<string, unknown>) => {
  if (props.weight === undefined || !('bold' in props)) return props
  const { bold: _echoed, ...own } = props
  return own
}

const attrsOf = (given: Record<string, unknown>) => {
  const props = styleOf(given)
  return Object.keys(props).sort().map(k => (props[k] === true ? ` ${k}` : ` ${k}=${JSON.stringify(props[k])}`)).join('')
}

// A drawn tree as indented tags, for a test to compare whole: every prop and every child string as handed
// over, in order. The handle a Button's handler lives under is left out: it differs from run to run.
export const show = (node: Drawn, depth = 0): string => {
  const pad = '  '.repeat(depth)
  if (typeof node === 'string') return pad + JSON.stringify(node)
  const open = `${pad}<${node.type}${attrsOf(node.props ?? {})}`
  const children = (node.children ?? []) as Drawn[]
  if (children.length === 0) return `${open} />`
  if (children.every(c => typeof c === 'string')) return `${open}>${children.map(c => JSON.stringify(c)).join(' ')}</${node.type}>`
  return [`${open}>`, ...children.map(c => show(c, depth + 1)), `${pad}</${node.type}>`].join('\n')
}

// A tree as a test writes it down, to compare with `show`: a template literal, without its first line
// break, its last, and its indentation.
export const golden = (text: string) => {
  const lines = text.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n')
  const indent = Math.min(...lines.map(l => /^ */.exec(l)?.[0].length ?? 0))
  return lines.map(l => l.slice(indent)).join('\n')
}

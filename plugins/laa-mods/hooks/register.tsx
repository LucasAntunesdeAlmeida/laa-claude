import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Finding, Findings, Learning, Learnings, Run, Snippet, Status } from '../types'
import { C } from './draw'
import { cardFor, dropCard, ended, engineCard, finished, launched, noticeOf, phaseNow, spawned, startCard } from './engines'
import type { Cards, Spawn } from './engines'
import {
  commitDir, countOpenHigh, countOpenLearnings, ENGINES, gateOfQuestions, HELP, isInGit, isPersonAnswer, isUnder, journalFile,
  laaSkillOf, LOCAL_DIR, nextActionOf, normalize, parentOf, parseFindings, parseJournal, parseLearnings, PIPELINES, progressOf, rejectLearning,
  resolveFrom, REVIEW_FILE, setFindingStatus, slash, stepNumbersOf, stillOpen, suggestionFor, TRACKED,
} from './git'
import type { Repo } from './git'
import { gateText, runTag, spinnerText, turnTagFor } from './labels'
import { findingsPane, learningsPane, locationOf, snippetsOf } from './panes'
import type { Cut } from './panes'
import { closingOf, isLaaClosing, reportCard } from './report'
import type { Tone } from './report'
import { stepperRow } from './stepper'
import { roleOf } from './tables'

type Engine = EngineInterface

const status = atom({ plugin: 'laa-mods', key: 'status' } as const, null)
const allowMain = atom({ plugin: 'laa-mods', key: 'allowMain' } as const, false)
const learnings = atom({ plugin: 'laa-mods', key: 'learnings' } as const, null)
const findings = atom({ plugin: 'laa-mods', key: 'findings' } as const, null)
const pipeline = atom({ plugin: 'laa-mods', key: 'pipeline' } as const, null)
const run = atom({ plugin: 'laa-mods', key: 'run' } as const, null)
const nextUp = atom({ plugin: 'laa-mods', key: 'nextUp' } as const, null)
const learningsBefore = atom({ plugin: 'laa-mods', key: 'learningsBefore' } as const, null)
// Written only under `visuals: full`.
const theme = atom({ plugin: 'laa-mods', key: 'theme' } as const, null)
const engines = atom({ plugin: 'laa-mods', key: 'engines' } as const, {})
const closings = atom({ plugin: 'laa-mods', key: 'closings' } as const, [])
const turnTags = atom({ plugin: 'laa-mods', key: 'turnTags' } as const, [])
const filters = atom({ plugin: 'laa-mods', key: 'filters' } as const, { findings: 'all', learnings: 'all' })

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

// How many of each the session keeps; the oldest go first.
const MAX_CLOSINGS = 50
const MAX_TURN_TAGS = 50
// Spawns are counted this long after the first of a burst, in one write. The count is armed again at every
// SPAWN_REARM-th spawn still waiting, so one timer that never fired (another plugin's hook may refuse it)
// delays the count until the next is armed; a burst that ends before then waits for the next spawn. At
// MAX_PENDING the ones still waiting are given up.
const SPAWN_FLUSH_MS = 200
const SPAWN_REARM = 8
const MAX_PENDING = 1024
// Snippets: how many findings get one, the largest file read for one, the longest file name a location may
// give for one, and how many files' worth are remembered.
const MAX_SNIPPETS = 30
const MAX_SNIPPET_BYTES = 1024 * 1024
const MAX_SNIPPET_PATH = 4096
const MAX_SNIPPET_CACHE = 60
const SNIPPET_BATCH = 8

// Workflow agents that started since the last flush, waiting to be counted on their engine's card.
// Display state that is safe to lose: a reload drops at most one burst.
const pendingSpawns: Spawn[] = []

// The review text the findings were last loaded from, so an unchanged review is not parsed or written again.
let loadedReview: { repo: string; text: string } | null = null

// The snippets already cut from a file, by where its path lands and its modification time, then by line.
const snippetCache = new Map<string, Map<number, Cut | null>>()

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
  const [branch, head, origin, common, hasLearnings, hasMap] = await Promise.all([
    git($, root, 'symbolic-ref', '-q', '--short', 'HEAD'),
    git($, root, 'rev-parse', '-q', '--verify', 'HEAD'),
    git($, root, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'),
    git($, root, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
    // Adopted means laa's committed state is there; a folder holding only local state doesn't count.
    $.fs.exists(`${root}/${LEARNINGS_FILE}`),
    $.fs.exists(`${root}/${MAP_FILE}`),
  ])
  const name = branch.ok && branch.out ? branch.out : null
  const defaults = origin.ok && origin.out ? [origin.out.replace(/^[^/]+\//, '')] : ['main', 'master']
  // The main checkout holds the git directory; from a worktree it's the parent of the common .git.
  const main = common.ok && /\/\.git$/.test(slash(common.out)) ? slash(common.out).replace(/\/\.git$/, '') : root
  return {
    top: root,
    main,
    branch: name,
    hasCommits: head.ok,
    isDefault: name !== null && defaults.includes(name),
    isAdopted: hasLearnings || hasMap,
  }
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

// Before a write to learnings.md, note which file and how many were open, so the turn's end can say what it added.
async function noteLearnings($: Engine, path: string) {
  const file = resolveFrom(await $.session.cwd(), path)
  if (!file.toLowerCase().endsWith(`/${LEARNINGS_FILE}`) || (await read($, learningsBefore)) !== null) return
  const before = { file, count: countOpenLearnings(await readText($, file)) }
  await update($, learningsBefore, b => b ?? before)
}

// At the end of a main-loop turn: say how many learnings it added to the file it wrote.
async function toastLearnings($: Engine) {
  const before = await read($, learningsBefore)
  if (!before) return
  await update($, learningsBefore, () => null)
  const after = countOpenLearnings(await readText($, before.file))
  if (after > before.count) $.ui.toast(`${PRE}${plural(after - before.count, 'learning')} logged · ${after} open · /${LEARNINGS_COMMAND}`)
}

// A /clear starts a new conversation: nothing the last one was doing carries over.
async function forgetConversation($: Engine, isFull: boolean) {
  await update($, run, () => null)
  await update($, nextUp, () => null)
  await update($, pipeline, () => null)
  await update($, learningsBefore, () => null)
  if (!isFull) return
  pendingSpawns.length = 0
  await update($, engines, () => ({}))
  await update($, closings, () => [])
  await update($, turnTags, () => [])
}

const mutedKey = (top: string) => `mutedMap:${slash(top).toLowerCase()}`

async function statusOf($: Engine, repo: Repo): Promise<Status> {
  let mapAge: number | null = null
  if (await $.fs.exists(`${repo.top}/${MAP_FILE}`)) {
    const last = await git($, repo.top, 'log', '-1', '--format=%H', '--', MAP_FILE)
    const count = last.ok && last.out ? await git($, repo.top, 'rev-list', '--count', `${last.out}..HEAD`) : null
    mapAge = count?.ok ? Number(count.out) || 0 : 0
  }
  // Journals live in the main checkout, so a run in a worktree and the main checkout see the same one.
  const journal = repo.branch ? parseJournal(await readText($, `${repo.main}/${journalFile(repo.branch)}`)) : null
  return {
    branch: repo.branch,
    isDefault: repo.isDefault && repo.hasCommits,
    openLearnings: countOpenLearnings(await readText($, `${repo.top}/${LEARNINGS_FILE}`)),
    mapAge,
    isMapMuted: Boolean(await $.store.get(mutedKey(repo.top))),
    openHigh: countOpenHigh(await readText($, `${repo.top}/${REVIEW_FILE}`)),
    paused: journal && journal.status !== 'done' && journal.status !== 'stopped' && journal.branch === repo.branch ? journal : null,
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
// and the closing report (a status line, then its Next list) ends it. A step line after the run
// was dropped picks the pipeline back up, with no record of the steps before it. Every step line of the
// block counts as seen, the last one being where the run stands.
// Under `visuals: full`, when the block closes a run, its key (the status line plus a hash of what stands
// under it) is recorded, which is how the report card knows the block as laa's and which ✗ report is the newest.
async function applyProgress($: Engine, text: string, isFull: boolean) {
  const p = progressOf(text)
  if (!p.skill && !p.step && !p.gate && !p.isClosing) return
  const printed = stepNumbersOf(text)
  const p0 = await read($, pipeline)
  let hadRun = false as boolean
  await update($, run, (r): Run | null => {
    hadRun = r !== null
    if (p.isClosing) return null
    let next = r
    if (p.skill && TRACKED.includes(p.skill) && next?.skill !== p.skill) next = { skill: p.skill, step: null, gate: null, engine: null, seen: [] }
    if (!next && p.step && p0) next = { skill: p0.skill, step: null, gate: null, engine: null }
    if (!next) return null
    if (p.step) {
      const isSame = next.step?.n === p.step.n && next.step.last === p.step.last
      next = { ...next, step: p.step, gate: null, engine: isSame ? next.engine : null }
      const seen = next.seen
      if (seen && printed.some(n => !seen.includes(n))) next = { ...next, seen: [...new Set([...seen, ...printed])].sort((a, b) => a - b) }
    }
    if (p.gate) next = { ...next, gate: p.gate }
    return next
  })
  if (!isFull || !p.isClosing || !hadRun) return
  const closing = closingOf(text)
  if (closing) await update($, closings, was => (was.at(-1) === closing.key ? was : [...was, closing.key].slice(-MAX_CLOSINGS)))
}

// The person's theme by name, for the Raster colors; null when it can't be read. Runs in the background
// (never awaited on a turn's path) and writes only a change.
async function loadTheme($: Engine) {
  let next: string | null = null
  try {
    const value = (await $.config.list()).find(row => row.key === 'theme')?.value
    next = typeof value === 'string' ? value : null
  } catch {
    // No settings menu to read: the Raster draws in the terminal's own color.
  }
  try {
    if ((await read($, theme)) !== next) await update($, theme, () => next)
  } catch {
    // The module may have reloaded; the next load tries again.
  }
}

// A workflow agent started: remember it, and count the whole burst on its engine's card in one write a
// moment later. No state is read or written here, so a phase starting dozens of agents at once costs each
// spawn nothing.
function noteSpawn($: Engine, spawn: Spawn) {
  if (pendingSpawns.length >= MAX_PENDING) pendingSpawns.length = 0
  pendingSpawns.push(spawn)
  if (pendingSpawns.length % SPAWN_REARM === 1) void $.clock.after(SPAWN_FLUSH_MS, () => void flushSpawns($))
}

// Counts every waiting spawn on its engine's card, in one write; never throws, since it runs from a timer.
async function flushSpawns($: Engine) {
  const batch = pendingSpawns.splice(0)
  if (batch.length === 0) return
  try {
    // Nothing to count on when no card could be theirs: skip the write.
    const cards = await read($, engines)
    if (batch.some(spawn => cardFor(cards, spawn) !== null)) await update($, engines, cs => spawned(cs, batch))
  } catch {
    // The module may have reloaded; the card shows fewer agents than ran.
  }
}

// A task notification arrived: its engine's card takes the report and how the task ended. One that names no
// card ends the card of `was`, the engine the run showed as running until now.
async function finishEngine($: Engine, text: string, was: string | null) {
  const notice = noticeOf(text)
  const settle = (cards: Cards) => finished(cards, notice) ?? ended(cards, was)
  const cards = await read($, engines)
  if (settle(cards) !== cards) await update($, engines, settle)
}

// At a turn's end: keep the run's footer tag under the turn's duration, so the turn's closing line can carry
// it. A turn with no run set is kept too, with no tag, so its line can't take the tag of a turn of nearly
// the same duration.
async function tagTurn($: Engine, ms: number) {
  const r = await read($, run)
  await update($, turnTags, tags => [...tags, { ms, tag: r ? runTag(r) : null }].slice(-MAX_TURN_TAGS))
}

// The person picked a filter in a pane.
async function setFilter($: Engine, pane: 'findings' | 'learnings', value: string) {
  await update($, filters, f => ({ ...f, [pane]: value }))
}

// The code around each finding, by the finding's index: at most 30 findings, files under the repo and
// outside .git, each read and split once whatever the number of findings in it, eight at a time. A file that is
// missing, over 1 MB, or binary gives no snippet; nothing here throws.
// A file is the repo's own by where its path lands, links followed, against where the repo's root lands
// (resolved once per load): a link that leads out of the repo, or into .git, is not read. What is read is
// the place the path landed, and each snippet names its file by the path inside the repo.
async function loadSnippets($: Engine, top: string, entries: readonly Finding[]) {
  const root = normalize(top)
  const wanted = entries.slice(0, MAX_SNIPPETS).flatMap(f => {
    const at = locationOf(f.location)
    if (at.line === null || at.file.length > MAX_SNIPPET_PATH) return []
    const path = resolveFrom(root, at.file)
    // Checked on the path's spelling first, so a location outside the repo costs no file system call.
    if (!isUnder(path, root) || isInGit(path, root)) return []
    return [{ index: f.index, file: path.slice(root.length + 1), path, line: at.line }]
  })
  const snippets: Record<number, Snippet> = {}
  if (wanted.length === 0) return snippets
  let realTop: string
  try {
    const landed = (await $.fs.stat(root, { resolve: true })).realPath
    if (landed === undefined) return snippets
    realTop = slash(landed)
  } catch {
    // The root can't be resolved: no file can be shown to be under it.
    return snippets
  }
  const cut = new Map<string, Map<number, Cut | null>>()
  const paths = [...new Set(wanted.map(w => w.path))]
  for (let at = 0; at < paths.length; at += SNIPPET_BATCH) {
    await Promise.all(paths.slice(at, at + SNIPPET_BATCH).map(async path => {
      try {
        const stat = await $.fs.stat(path, { resolve: true })
        if (stat.kind !== 'file' || stat.size > MAX_SNIPPET_BYTES || stat.realPath === undefined) return
        const real = slash(stat.realPath)
        if (!isUnder(real, realTop) || isInGit(real, realTop)) return
        const key = `${real}\n${stat.mtimeMs}`
        const lines = wanted.filter(w => w.path === path).map(w => w.line)
        let known = snippetCache.get(key)
        if (!known || lines.some(line => !known?.has(line))) {
          const text = String(await $.fs.read(real))
          known = snippetsOf(text, lines)
          snippetCache.delete(key)
          snippetCache.set(key, known)
          for (const old of [...snippetCache.keys()].slice(0, Math.max(0, snippetCache.size - MAX_SNIPPET_CACHE))) snippetCache.delete(old)
        }
        cut.set(path, known)
      } catch {
        // Missing or unreadable: this file's findings draw without code.
      }
    }))
  }
  for (const w of wanted) {
    const snippet = cut.get(w.path)?.get(w.line)
    if (snippet) snippets[w.index] = { ...snippet, path: w.file }
  }
  return snippets
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

const isSameSnippet = (a: Snippet | undefined, b: Snippet | undefined) =>
  a !== undefined && b !== undefined && a.source === b.source && a.startLine === b.startLine && a.path === b.path

const hasSameSnippets = (a: Record<number, Snippet>, b: Record<number, Snippet>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => isSameSnippet(a[Number(k)], b[Number(k)]))

// The code `shown` already has for the findings still at the same place of the review, by their index.
const keptSnippets = (shown: Findings | null, entries: readonly Finding[]) => {
  const kept: Record<number, Snippet> = {}
  for (const f of entries) {
    const had = shown?.entries.some(o => o.index === f.index && o.location === f.location) ? shown.snippets?.[f.index] : undefined
    if (had) kept[f.index] = had
  }
  return kept
}

// The code around the findings of `list`, read again where a cited file changed, and written only when it
// differs from what `list` shows. `text` is the review `list` was parsed from: once another review has been
// loaded, what was read for this one is dropped. Never throws, since a turn's end leaves it running.
async function refreshSnippets($: Engine, top: string, text: string, list: Findings): Promise<Findings> {
  try {
    const snippets = await loadSnippets($, top, list.entries)
    if (loadedReview?.repo !== top || loadedReview.text !== text) return list
    if (hasSameSnippets(list.snippets ?? {}, snippets)) return list
    return (await update($, findings, f => (f?.repo === top ? { ...f, snippets } : f))) ?? list
  } catch {
    // The module may have reloaded: the findings keep the code they had.
    return list
  }
}

// Under `visuals: full` the findings carry the code around each one. A review file that has not changed
// since the last load is not parsed or written again; the files it cites are still asked their age, so an
// edited one is cut again. The command and the pane's buttons wait for the code (`isAwaited`), so the pane
// opens complete. A turn's end does not: it writes the entries at once, each keeping the code it already
// had, and leaves the reading to finish on its own.
async function loadFindings($: Engine, top: string, isFull: boolean, isAwaited = true) {
  const text = await readText($, `${top}/${REVIEW_FILE}`)
  if (!isFull) {
    const next: Findings = { repo: top, entries: parseFindings(text) }
    await update($, findings, () => next)
    return next
  }
  const shown = await read($, findings)
  let list = shown?.repo === top && loadedReview?.repo === top && loadedReview.text === text ? shown : null
  if (!list) {
    const entries = parseFindings(text)
    const snippets = isAwaited ? await loadSnippets($, top, entries) : keptSnippets(shown?.repo === top ? shown : null, entries)
    const next: Findings = { repo: top, entries, snippets }
    await update($, findings, () => next)
    loadedReview = { repo: top, text }
    if (isAwaited) return next
    list = next
  }
  const settled = refreshSnippets($, top, text, list)
  if (isAwaited) return settled
  void settled
  return list
}

// The person pressed Fix: put a self-contained request for the fix in the prompt, for them to send.
async function fixFindings($: Engine, top: string, chosen: readonly Finding[], isFull: boolean) {
  const entries = stillOpen(await readText($, `${top}/${REVIEW_FILE}`), chosen)
  if (entries.length < chosen.length) {
    $.ui.toast(`${PRE}last-review.md changed since the pane loaded it; reloaded.`)
    await loadFindings($, top, isFull)
    return
  }
  const what = entries.map(f => `${f.tag} ${f.location} ${f.title}${f.fix ? ` → ${f.fix}` : ''}`).join('; ')
  const text = entries.length === 1
    ? `Fix this finding from the last review, then mark it fixed in ${REVIEW_FILE}: ${what}`
    : `Fix these findings from the last review, then mark each one fixed in ${REVIEW_FILE}: ${what}`
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  $.ui.toast(filled.isFilled ? `${PRE}the fix is in the prompt. Press Enter to run it.` : `${PRE}the prompt is busy; try again from the pane.`)
}

// The person pressed Dismiss: mark the finding dismissed and reload.
async function dismissFinding($: Engine, top: string, finding: Finding, isFull: boolean) {
  const path = `${top}/${REVIEW_FILE}`
  const next = setFindingStatus(await readText($, path), finding.index, finding.location, 'dismissed (in the laa-findings pane)')
  if (next === null) {
    $.ui.toast(`${PRE}last-review.md changed since the pane loaded it; reloaded.`)
  } else {
    await $.fs.write(path, next)
    $.ui.toast(`${PRE}dismissed ${finding.tag} ${finding.location}`)
  }
  await loadFindings($, top, isFull)
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
const headerOf = (repo: Repo | null, s: Status | null) => {
  if (!repo) return `${PRE}not in a git repository`
  if (!s) return `${PRE}${baseName(repo.top)} · not adopted by laa yet`
  const map = s.mapAge === null ? 'no project map' : `map ${plural(s.mapAge, 'commit')} old`
  return `${PRE}${s.branch ?? 'detached HEAD'} · ${map} · ${plural(s.openLearnings, 'open learning')} · ${plural(s.openHigh, 'high finding')} open`
}

// /laa-help as Markdown: the command's transcript row, and what the model reads of it.
function helpText(repo: Repo | null, s: Status | null, allowed: boolean) {
  const lines = [headerOf(repo, s), '']
  for (const g of HELP) {
    lines.push(`**${g.group}**`)
    for (const [command, what] of g.items) lines.push(`- \`${command}\` ${what}`)
    lines.push('')
  }
  lines.push(`**Engines** (the entry skills run these; typed alone, each does one stage): ${ENGINES.join(' · ')}`)
  lines.push(`**Session** \`/${ALLOW_COMMAND}\`: edits on the default branch are ${allowed ? 'allowed' : 'blocked'}`)
  const suggested = repo ? suggestionFor(s, repo.isAdopted) : null
  if (suggested) lines.push('', `**Suggested** \`${suggested.command}\`: ${suggested.why}`)
  return lines.join('\n')
}

// The lines of a /laa-help row that hold the state at the time it ran, so the drawn row never changes afterwards.
const helpStateOf = (text: string) => ({
  header: text.split('\n')[0] ?? '',
  session: /^\*\*Session\*\* `([^`]+)`: (.+)$/m.exec(text),
  suggested: /^\*\*Suggested\*\* `([^`]+)`: (.+)$/m.exec(text),
})

// A finding's tag color in the 0.3.0 pane, which `visuals: minimal` keeps; the full pane picks its own (never red).
const tagColor = (tag: string) => (tag === 'CRIT' || tag === 'HIGH' ? C.danger : tag === 'MED' ? C.warning : undefined)

export const register: Register = (on, options) => {
  const guard = String(options.guard ?? 'adopted')
  // `full` draws the stepper, the cards, and the visual panes. `minimal` registers none of the new hooks
  // and takes the 0.3.0 branch of every shared one, so it draws exactly what 0.3.0 drew.
  const isFull = String(options.visuals ?? 'full') !== 'minimal'

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
    if (isFull) void loadTheme($)
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
    const repo = await repoAt($, await $.session.cwd())
    await refresh($)
    return { text: helpText(repo, repo?.isAdopted ? await read($, status) : null, await read($, allowMain)) }
  })

  on('command.run', { command: LEARNINGS_COMMAND }, async ($, e) => {
    const where = e.args.trim() || (await $.session.cwd())
    const repo = await repoAt($, resolveFrom(await $.session.cwd(), where))
    if (!repo) return { text: `${PRE}${where} is not in a git repository.` }
    if (isFull) await setFilter($, 'learnings', 'all')
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
    if (isFull) await setFilter($, 'findings', 'all')
    const list = await loadFindings($, repo.top, isFull)
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
  // Under `visuals: full` a laa engine also gets a card, made before the launch answers because the run's
  // first agents can start before it does; a launch that is refused, fails, or throws takes the card away again.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const name = (e.name ?? '').replace(/^laa:/, '')
    const id = isFull && ENGINES.includes(name) && e.tool_use_id ? e.tool_use_id : null
    if (id) {
      try {
        await update($, engines, cards => startCard(cards, id, name))
      } catch {
        // No card: the row draws as the engine draws it.
      }
    }
    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } catch (thrown) {
      // The launch threw: there is no run to show, and the error is the caller's to see.
      if (id) {
        try {
          await update($, engines, cards => dropCard(cards, id))
        } catch {
          // The card stays, as a run that never reports.
        }
      }
      throw thrown
    }
    const isLaunched = !('deny' in ran) && !ran.isError
    if (name && isLaunched) await update($, run, r => (r ? { ...r, engine: name } : r))
    if (id) {
      try {
        const result: unknown = isLaunched ? ran.result : null
        await update($, engines, cards => {
          const card = cards[id]
          if (!isLaunched) return dropCard(cards, id)
          return card ? { ...cards, [id]: launched(card, result) } : cards
        })
      } catch {
        // The card keeps what it had.
      }
    }
    return ran
  })

  // Each agent a laa engine starts is counted on the engine's card. An observer: it never refuses a spawn,
  // touches only workflow agents, and makes no state call of its own (`noteSpawn` batches them).
  if (isFull) {
    on('agent.spawn', async ($, e, next) => {
      if (!e.workflow) return next(e)
      const started = await next(e)
      try {
        if (!('deny' in started && started.deny)) {
          noteSpawn($, { toolUseId: e.tool_use_id, runId: e.workflow.runId, role: roleOf(e.description || e.name || '') })
        }
      } catch {
        // The card shows one agent fewer.
      }
      return started
    }).catch(($, e, next) => next(e))
  }

  // The model's own rows carry the run's mode, step, gate, and closing lines; a task notification ends the
  // engine; under `visuals: full` the person's own answer ends a gate's wait.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.agentId) return stored
    try {
      if (e.door === 'response' && e.message.type === 'assistant') {
        const text = textOf(e.message.content)
        await applyProgress($, text, isFull)
      } else if (e.door === 'delivery' || e.origin.kind === 'task-notification') {
        const was = isFull ? (await read($, run))?.engine ?? null : null
        // A background task finished (a workflow's notification, folded into a turn or starting its own).
        await update($, run, r => (r?.engine ? { ...r, engine: null } : r))
        if (isFull) await finishEngine($, textOf(e.message.content), was)
      } else if (isFull && isPersonAnswer(e.door, e.origin)) {
        // The person answered: the gate no longer waits on them while Claude works on the answer.
        await update($, run, r => (r?.gate ? { ...r, gate: null } : r))
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
    await applyProgress($, e.answer, isFull)
    if (isFull) {
      try {
        await tagTurn($, e.durationMs)
      } catch {
        // The turn's closing line stays as the engine draws it.
      }
    }
    // A turn ends mid-run only to wait on a text gate or a background workflow; otherwise the run is over,
    // whether it closed with a report or stopped (Stop at a gate, a resume with nothing to resume).
    await update($, run, r => (r && (r.gate || r.engine) ? r : null))
    const command = nextActionOf(e.answer)
    await update($, nextUp, () => (command ? { text: command, isNudged: false } : null))
    await toastLearnings($)
    void refresh($)
    // The model may have marked findings fixed: keep an open pane current.
    const shown = await read($, findings)
    if (shown) await loadFindings($, shown.repo, isFull, false)

    const p = await read($, pipeline)
    if (p && p.hasCommitted && !p.isNudged) void $.clock.after(400, () => void suggestRetro($))
    else if (command) void $.clock.after(400, () => void suggestNext($))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await forgetConversation($, isFull)
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
    if (skill && TRACKED.includes(skill)) await update($, run, () => ({ skill, step: null, gate: null, engine: null, seen: [] }))
    if (isFull && skill) void loadTheme($)
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
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, runTag(r)] } })
  })

  if (isFull) {
    // The spinner's line names the run and where it stands, unless the engine set a message of its own
    // (while compacting, say), which is never hidden.
    on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
      let message: string | null = null
      try {
        const r = e.props.message === null ? await read($, run) : null
        if (r) {
          const cards = r.engine ? Object.values(await read($, engines)) : []
          const card = cards.filter(c => c.name === r.engine && c.state === 'running').sort((a, b) => b.seq - a.seq)[0]
          message = spinnerText(r, card ? phaseNow(card) : null)
          // On the desktop the word is the live step ("Creating notes.md"); keep it beside the run.
          if (e.surface === 'desktop' && e.props.word !== 'Working') message = `${message} · ${e.props.word}`
        }
      } catch {
        message = null
      }
      return message === null ? next(e) : next({ ...e, props: { ...e.props, message } })
    })

    // While a gate waits on the person, the hint under the prompt says so. The terminal keeps its own line
    // (the pills stay live) and takes the text as its tail; the desktop draws no tail, so there it joins the hint.
    on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
      let waiting: string | null = null
      try {
        const r = e.props.isWorking ? null : await read($, run)
        if (r?.gate) waiting = gateText(r)
      } catch {
        waiting = null
      }
      if (waiting === null) return next(e)
      if (e.surface === 'terminal') {
        return next({ ...e, props: { ...e.props, tail: [e.props.tail, waiting].filter(Boolean).join(' · ') } })
      }
      return next({ ...e, props: { ...e.props, hint: [e.props.hint, waiting].filter(Boolean).join(' · ') } })
    })

    // The line that closes a turn names the run the turn belonged to, when one did.
    on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
      let tag: string | null = null
      try {
        tag = turnTagFor(await read($, turnTags), e.props.durationMs)
      } catch {
        tag = null
      }
      const line = await next(e)
      if (tag === null) return line
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box key="laa-turn">
          {line}
          <Text dimColor> · {tag}</Text>
        </Box>
      )
    })

    // A laa engine's Workflow row gets its card under it. Whether the row is a laa engine's is read from
    // the call's own input before any state, so another workflow's row never redraws for laa's.
    on('ui.render', { component: 'ToolUse', props: { tool: 'Workflow' } }, async ($, e, next) => {
      let card = null
      try {
        const input = e.props.input as { name?: unknown } | null
        const name = typeof input?.name === 'string' ? input.name.replace(/^laa:/, '') : ''
        const isDrawable = ENGINES.includes(name) && !e.props.isErrored && !e.props.isInterrupted
        if (isDrawable) card = (await read($, engines))[e.props.tool_use_id] ?? null
      } catch {
        card = null
      }
      const row = await next(e)
      if (!card) return row
      try {
        return engineCard($.ui.resolve(e), row, card) ?? row
      } catch {
        return row
      }
    })

    // A laa closing report is drawn as a framed card. The cheap checks come first: a block with no Next
    // list is passed on untouched, and state is read only once the block has the shape of a closing report.
    on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
      if (e.props.isSummary || !e.props.text.includes('**Next**')) return next(e)
      let card = null
      try {
        const closing = closingOf(e.props.text)
        const recorded = closing ? await read($, closings) : []
        if (closing && isLaaClosing(closing, recorded)) {
          let tone: Tone = C.success
          if (!closing.ok) {
            // At most one red item on screen: the blocked branch in the band wins, then the newest ✗ report.
            const [s, allowed] = await Promise.all([read($, status), read($, allowMain)])
            const isBandRed = Boolean(s?.branch && s.isDefault && !allowed)
            tone = closing.key === recorded.at(-1) && !isBandRed ? C.danger : C.warning
          }
          card = reportCard($.ui.resolve(e), closing, tone)
        }
      } catch {
        card = null
      }
      return card ?? next(e)
    })
  }

  // The band: at most one alarm (a blocked default branch), what's running or paused, then what's waiting, quietest last.
  // Under `visuals: full` the stepper is its second row, when there is one to draw.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Full reads everything it draws from at once; minimal reads as 0.3.0 did.
    const [s, shownRun, isAllowed, themeName] = isFull
      ? await Promise.all([read($, status), read($, run), read($, allowMain), read($, theme)])
      : [await read($, status), null, false, null]
    if (e.props.hasSurvey || !s) return next(e)
    const r = isFull ? shownRun : await read($, run)
    const allowed = isFull ? isAllowed : await read($, allowMain)
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
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
    const row = (
      <Box key="laa">
        <Text dimColor>laa · </Text>
        {parts.flatMap((p, i) => (i === 0 ? [p] : [<Text key={`sep${i}`} dimColor> · </Text>, p]))}
      </Box>
    )
    if (!isFull) return row
    try {
      const steps = stepperRow(els, { run: r, paused: s.paused, columns: e.props.bodyColumns, maxRows: e.props.maxRows, theme: themeName })
      if (steps) {
        return (
          <Box key="laa-band" flexDirection="column">
            {row}
            {steps}
          </Box>
        )
      }
    } catch {
      // The stepper is an extra: the band's own row always draws.
    }
    return row
  })

  // /laa-help's row: its own text, with commands in the action color. The state lines come from the text,
  // not from live state, so the row reads the same later as it did when it ran (and as the model read it).
  on('ui.render', { component: 'CommandOutput', props: { command: HELP_COMMAND } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const { header, session, suggested } = helpStateOf(e.props.text)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(...HELP.flatMap(g => g.items.map(([command]) => command.length)))
    return (
      <Box key="laa-help" flexDirection="column">
        <Text dimColor>{header}</Text>
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
          {session && <Text dimColor>{`Session: ${session[1]} · ${session[2]}`}</Text>}
        </Box>
        {suggested && (
          <Box key="suggested" marginTop={1}>
            <Text bold>Suggested </Text>
            <Text color={C.action}>{suggested[1]}</Text>
            <Text dimColor>{`  ${suggested[2]}`}</Text>
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: LEARNINGS_PANE }, async ($, e) => {
    const list = await read($, learnings)
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    if (!list) return <Text dimColor>Run /{LEARNINGS_COMMAND} to load this repo's learnings.</Text>
    if (isFull) {
      try {
        const visual = learningsPane(
          els,
          { list, filter: (await read($, filters)).learnings, columns: e.props.bodyColumns },
          {
            onReject: entry => rejectEntry($, list.repo, entry),
            onEvolve: () => startEvolve($),
            onFilter: value => setFilter($, 'learnings', value),
          },
        )
        if (visual) return visual
      } catch {
        // The 0.3.0 pane below draws instead.
      }
    }
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
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    if (!list) return <Text dimColor>Run /{FINDINGS_COMMAND} to load the last review.</Text>
    if (isFull) {
      try {
        const visual = findingsPane(
          els,
          { list, filter: (await read($, filters)).findings, columns: e.props.bodyColumns, surface: e.surface },
          {
            onFix: chosen => fixFindings($, list.repo, chosen, isFull),
            onDismiss: finding => dismissFinding($, list.repo, finding, isFull),
            onFilter: value => setFilter($, 'findings', value),
          },
        )
        if (visual) return visual
      } catch {
        // The 0.3.0 pane below draws instead.
      }
    }
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
              <Button key={`fix${f.index}`} label="Fix" onPress={() => fixFindings($, list.repo, [f], isFull)} />
              <Button key={`dismiss${f.index}`} label="Dismiss" onPress={() => dismissFinding($, list.repo, f, isFull)} />
            </Box>
          </Box>
        ))}
        {high.length > 0 && (
          <Box marginTop={1}>
            <Button key="fixHigh" label={`Fix all CRIT and HIGH (${high.length})`} variant="primary" hotkey="f" onPress={() => fixFindings($, list.repo, high, isFull)} />
          </Box>
        )}
      </Box>
    )
  })
}

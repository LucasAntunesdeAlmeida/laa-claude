// A step of a laa run, from its `**▸ <n>/<last> · <title>**` line.
export type Step = { n: number; last: number; title: string }

// .claude/laa/local/runs/<branch>.md: where a laa pipeline stopped, as /laa:resume reads it.
export type Journal = {
  skill: string
  branch: string
  status: string
  step: Step | null
  // The ★ gate it waits on, without the star; null when none.
  gate: string | null
}

// What the band above the prompt shows for the session's repo.
export type Status = {
  branch: string | null
  isDefault: boolean
  openLearnings: number
  // Commits since .claude/laa/project-map.md last changed; null when there is no map.
  mapAge: number | null
  // The person muted the map nudge for this repo from the band.
  isMapMuted: boolean
  // Open CRIT and HIGH findings in .claude/laa/local/last-review.md.
  openHigh: number
  // The journal of a pipeline that stopped on this branch and hasn't finished.
  paused: Journal | null
}

// One open entry of .claude/laa/learnings.md, as the learnings pane lists it.
export type Learning = {
  // Its place among all the file's `## ` entries, open or not.
  index: number
  title: string
  scope: string
  kind: string
  target: string
  signal: string
  proposal: string
}

// The learnings the learnings pane shows, and the repo they came from.
export type Learnings = { repo: string; entries: Learning[] }

// One open entry of .claude/laa/local/last-review.md, as the findings pane lists it.
export type Finding = {
  // Its place among all the file's `## ` entries, open or not.
  index: number
  tag: string
  location: string
  title: string
  fix: string
}

// The lines of a file around a finding, as the findings pane shows them under it.
export type Snippet = {
  source: string
  // The number of the first line of `source` in its file, from 1.
  startLine: number
  // The file as the finding names it, relative to the repo.
  path: string
}

// The findings the findings pane shows, and the repo they came from.
export type Findings = {
  repo: string
  entries: Finding[]
  // The code around each finding, by the finding's `index`; only under `visuals: full`, and only where the file could be read.
  snippets?: Record<number, Snippet>
}

// The laa pipeline (/laa:fix, /laa:feature, /laa:migrate, /laa:build) running in this session,
// for the /laa:retro nudge at its end.
export type Pipeline = { skill: string; hasCommitted: boolean; isNudged: boolean }

// The laa run in progress in this session, for the band and the footer.
export type Run = {
  skill: string
  step: Step | null
  // The ★ gate waiting on the person, without the star; null when none.
  gate: string | null
  // The workflow running in the background, until its notification or the next step.
  engine: string | null
  // The numbers of the steps this run printed, in order. Absent when the run was joined mid-way
  // (a step line picked a dropped pipeline back up), so nothing is known of the steps before.
  seen?: number[]
}

// One laa engine (a workflow) this session launched, for its card in the transcript.
export type EngineRun = {
  // Its place among the session's engine runs; the lowest is dropped first once too many are kept.
  seq: number
  // The engine's name without `laa:` (`investigate`).
  name: string
  // The background task and the workflow run the launch answered with; null until it has, or when it named none.
  taskId: string | null
  runId: string | null
  // `ended`: a notification arrived that could not be matched to a report.
  state: 'running' | 'done' | 'failed' | 'ended'
  // How many agents each role started (`verify` → 10), in the order the roles first appeared.
  roles: Record<string, number>
  // How many agents the run started, roles known or not.
  count: number
  // The first line of the engine's report, from its notification; null while it runs or when none was found.
  result: string | null
  // The notification's own status word (`completed`, `failed`); null while it runs.
  status: string | null
}

// The footer tag of a run as it stood when a turn ended, by the turn's duration, so that turn's closing line can carry it.
// `tag` is null for a turn that ended with no run set: its line stays the engine's own.
export type TurnTag = { ms: number; tag: string | null }

// What each pane's filter is set to; `all` shows everything.
export type Filters = { findings: string; learnings: string }

// The first command in the last closing report's Next list, offered once as the prompt's suggestion.
export type NextUp = { text: string; isNudged: boolean }

declare module 'claude-code' {
  interface PluginState {
    'laa-mods': {
      status: Status | null
      allowMain: boolean
      learnings: Learnings | null
      findings: Findings | null
      pipeline: Pipeline | null
      run: Run | null
      nextUp: NextUp | null
      // The learnings.md this turn first wrote, and its open entries before that; the turn's end toasts what it added.
      learningsBefore: { file: string; count: number } | null
      // The rest is written only under `visuals: full`.
      // The person's theme by name, for the two colors a Raster can't take from the theme; null when unread.
      theme: string | null
      // The engines this session launched, by the Workflow call's tool_use_id; the newest 20.
      engines: Record<string, EngineRun>
      // The keys (status line plus a hash of the body) of the closing reports this session's runs ended with; the newest 50.
      closings: string[]
      // The newest 50.
      turnTags: TurnTag[]
      filters: Filters
    }
  }
}

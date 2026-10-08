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

// The findings the findings pane shows, and the repo they came from.
export type Findings = { repo: string; entries: Finding[] }

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
}

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
    }
  }
}

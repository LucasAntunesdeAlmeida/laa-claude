// What the band above the prompt shows for the session's repo.
export type Status = {
  branch: string | null
  isDefault: boolean
  openLearnings: number
  // Commits since .claude/laa/project-map.md last changed; null when there is no map.
  mapAge: number | null
}

// One open entry of .claude/laa/learnings.md, as the /laa pane lists it.
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

// The learnings the /laa pane shows, and the repo they came from.
export type Learnings = { repo: string; entries: Learning[] }

declare module 'claude-code' {
  interface PluginState {
    'laa-mods': { status: Status | null; allowMain: boolean; learnings: Learnings | null }
  }
}

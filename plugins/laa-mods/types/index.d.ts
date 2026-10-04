// What the band above the prompt shows for the session's repo.
export type Status = {
  branch: string | null
  isDefault: boolean
  openLearnings: number
  // Commits since .claude/laa/project-map.md last changed; null when there is no map.
  mapAge: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'laa-mods': { status: Status | null; allowMain: boolean }
  }
}

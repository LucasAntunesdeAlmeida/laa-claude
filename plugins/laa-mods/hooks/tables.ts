// Data only: the steps of each tracked skill and the phases of each engine, as the stepper and the
// engine card draw them. A leaf with no imports, so `node --test` loads it as it is; the drift tests under
// tests/drift check it against the skills' headings and the workflows' `meta.phases`.

// One step of a skill: the short label the stepper draws, and the title its SKILL.md heading carries
// (without a trailing ` (…)`), which is what the skill prints in its `**▸ n/last · Title**` line.
export type StepDef = { readonly label: string; readonly title: string }

// A skill's steps in order; `first` is the number of the first one (0 where the skill starts by loading context).
export type StepTable = { readonly first: number; readonly steps: readonly StepDef[] }

const table = (first: number, ...steps: readonly (readonly [string, string])[]): StepTable =>
  ({ first, steps: steps.map(([label, title]) => ({ label, title })) })

// Labels are lowercase ASCII, 11 characters at most, and unique within a skill. No step carries a static ★:
// a gate is drawn where the run says it waits.
export const STEPS: Readonly<Record<string, StepTable>> = {
  fix: table(0,
    ['context', 'Load context'], ['size', 'Triage the size'], ['repro', 'Reproduce first'], ['investigate', 'Investigate'],
    ['decide', 'Decide'], ['fix', 'Fix'], ['review', 'Review'], ['retro', 'Close the loop']),
  feature: table(0,
    ['context', 'Load context'], ['size', 'Size it'], ['explore', 'Explore'], ['clarify', 'Clarify'], ['design', 'Design'],
    ['plan', 'Plan slices'], ['build', 'Implement'], ['review', 'Review'], ['retro', 'Close the loop']),
  migrate: table(0,
    ['context', 'Load context'], ['size', 'Size it'], ['pilot', 'Pilot'], ['plan', 'Find the sites and plan batches'],
    ['transform', 'Transform'], ['sweep', 'Sweep for leftovers'], ['review', 'Review'], ['retro', 'Close the loop']),
  build: table(1,
    ['prd', 'Intake → PRD'], ['arch', 'Architecture'], ['plan', 'Plan'], ['scaffold', 'Scaffold'],
    ['milestones', 'Milestones 1..N'], ['retro', 'Close the loop']),
  review: table(1,
    ['target', 'Resolve the target'], ['reviewers', 'Pick extra reviewers'], ['panel', 'Run the panel'], ['report', 'Report']),
  adopt: table(0,
    ['intel', 'Code intelligence'], ['map', 'Map'], ['state', 'Write the project state'], ['plugins', 'Wire plugins for the team'],
    ['assets', 'Generate repo-specific assets'], ['report', 'Report']),
  forge: table(1,
    ['kind', 'Choose the right kind'], ['evidence', 'Gather evidence'], ['write', 'Write it'], ['smoke', 'Smoke-test'],
    ['register', 'Register']),
  evolve: table(1,
    ['gather', 'Gather'], ['cluster', 'Cluster and prioritize'], ['local', 'Local improvements'],
    ['upstream', 'Upstream improvements'], ['report', 'Report']),
  resume: table(1, ['find', 'Find the journal'], ['context', 'Rebuild the context'], ['continue', 'Continue']),
}

// The number of a table's last step: the `last` of the step lines its skill prints.
export const lastOf = (t: StepTable) => t.first + t.steps.length - 1

// The steps a run is walking: its skill's own table while the printed `last` fits it (or no step is known
// yet), else the table whose last step fits and whose title at `n` is the one printed, which is how a
// /laa:resume run printing another skill's steps is drawn. null when nothing fits: no stepper is drawn.
export const tableFor = (skill: string, step: { n: number; last: number; title: string } | null): StepTable | null => {
  const own = STEPS[skill] ?? null
  if (!step) return own
  if (own && lastOf(own) === step.last) return own
  const title = step.title.trim().toLowerCase()
  return Object.values(STEPS).find(t => lastOf(t) === step.last && t.steps[step.n - t.first]?.title.toLowerCase() === title) ?? null
}

// Each engine's phases in order: the titles of its workflow's `meta.phases`.
export const PHASES: Readonly<Record<string, readonly string[]>> = {
  investigate: ['Investigate', 'Cluster', 'Verify'],
  'review-panel': ['Review', 'Verify'],
  'design-panel': ['Propose', 'Judge', 'Synthesize', 'Deep-dive'],
  'implement-slices': ['Implement', 'Review', 'Fix'],
  'migrate-sites': ['Discover', 'Transform', 'Verify', 'Fix'],
  'map-repo': ['Scout', 'Explore', 'Synthesize'],
}

// Roles whose name is not their phase's title. The design panel labels its deep-dive specialists by what
// each writes (`dataModel`, `api`, `threatModel`, `scaleRisks`, `infra`), whose lowercase prefixes these are.
export const ROLE_ALIAS: Readonly<Record<string, string>> = {
  architect: 'Propose',
  data: 'Deep-dive',
  api: 'Deep-dive',
  threat: 'Deep-dive',
  scale: 'Deep-dive',
  infra: 'Deep-dive',
}

// The role of a workflow agent: the lowercase prefix of its label (`verify:2:logic` → `verify`); '' when it has none.
export const roleOf = (label: string) => /^[a-z-]+/.exec(label)?.[0] ?? ''

// The phase of `engine` a role works in: the phase titled like the role, else the role's alias; null when neither is one.
export const phaseOf = (engine: string, role: string): string | null => {
  const phases = PHASES[engine] ?? []
  const alias = ROLE_ALIAS[role]
  return phases.find(p => p.toLowerCase() === role) ?? (alias !== undefined && phases.includes(alias) ? alias : null)
}

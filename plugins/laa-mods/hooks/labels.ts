// Pure text: what the footer, the spinner, the prompt hint, and a turn's closing line say about the run.
// One place, so they never disagree about the skill, the step, or the gate.

import type { Run, TurnTag } from '../types'

// The footer's mode label: the run and where it stands (`laa:fix 3/7`, `laa:feature ★`, `laa:resume`).
export const runTag = (r: Run) => `laa:${r.skill}${r.gate ? ' ★' : r.step ? ` ${r.step.n}/${r.step.last}` : ''}`

// The spinner's line while a run is active. A gate wins, as it does in the band and the footer; then the
// engine running in the background, with its phase once one is known; then the step; then the skill alone.
//   laa:feature · ★ Approve the plan?
//   laa:fix · engine investigate · Verify
//   laa:fix · Investigate 3/7
//   laa:fix
export const spinnerText = (r: Run, phase: string | null) => {
  if (r.gate) return `laa:${r.skill} · ★ ${r.gate}`
  if (r.engine) return `laa:${r.skill} · engine ${r.engine}${phase ? ` · ${phase}` : ''}`
  if (r.step) return `laa:${r.skill} · ${r.step.title} ${r.step.n}/${r.step.last}`
  return `laa:${r.skill}`
}

// What the prompt hint adds while a gate waits on the person.
export const gateText = (r: Run) => `★ waiting on you: ${r.gate ?? ''}`

// How far a turn line's duration may be from the one its turn ended with and still be that turn's.
const TURN_SLACK_MS = 50

// The tag of the turn whose duration is nearest `ms`, the newest on a tie; null when none is within 50 ms,
// or when that turn belonged to no run.
export const turnTagFor = (tags: readonly TurnTag[], ms: number): string | null => {
  let best: TurnTag | null = null
  for (const t of tags) {
    const off = Math.abs(t.ms - ms)
    if (off <= TURN_SLACK_MS && (!best || off <= Math.abs(best.ms - ms))) best = t
  }
  return best?.tag ?? null
}

export const meta = {
  name: 'investigate',
  description: 'Engine · root-cause fan-out behind /laa:fix: investigators on independent angles, clustered, each cause adversarially verified. Typed alone it investigates only (no repro, fix, or review)',
  whenToUse: 'Called by /laa:fix for non-trivial bugs, or typed as /laa:investigate <bug description>. args: { bug, repro?, context?, angles?, thorough? }',
  phases: [
    { title: 'Investigate', detail: 'one investigator per angle' },
    { title: 'Cluster', detail: 'merge duplicate hypotheses', model: 'opus' },
    { title: 'Verify', detail: 'skeptics try to refute each root cause' },
  ],
}

// Plugin agent types resolve as '<plugin>:<agent>'. If resolution fails (plugin renamed, older Claude Code),
// fall back to a general-purpose agent told to follow that agent's role, so the workflow still completes.
// Each fallback is recorded in `degraded` so the report says which specialists were missing.
const degraded = []
const spawn = (prompt, opts) => agent(prompt, opts).catch(err => {
  if (!opts.agentType) throw err
  log(`agentType ${opts.agentType} unavailable (${err.message}); falling back to default agent`)
  if (!degraded.includes(opts.agentType)) degraded.push(opts.agentType)
  const { agentType, ...rest } = opts
  return agent(`Act as the ${agentType.split(':').pop()} specialist from the laa toolkit.\n\n${prompt}`, rest)
})

// The Markdown report every workflow returns: one line per entry, plus a note when specialists fell back.
const render = lines => lines.join('\n') +
  (degraded.length ? `\n\n**▲ Degraded** · ${degraded.join(', ')} unavailable; generic agents stood in` : '')

// Skills pass args as an object. Typing `/laa:<workflow> <text>` passes plain text instead (and an
// object sometimes arrives JSON-encoded), so accept all three.
const fromText = (raw, key) => {
  const text = raw.trim()
  if (text.startsWith('{')) {
    try { return JSON.parse(text) } catch (e) { /* not JSON: treat as plain text */ }
  }
  return text ? { [key]: text } : {}
}

const DEFAULT_ANGLES = ['recent-changes', 'data-flow', 'config-env', 'concurrency', 'data-state']

const HYPOTHESES = {
  type: 'object',
  properties: {
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rootCause: { type: 'string' },
          location: { type: 'string', description: 'path:line' },
          mechanism: { type: 'string' },
          evidenceFor: { type: 'string' },
          evidenceAgainst: { type: 'string' },
          howToConfirm: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['rootCause', 'location', 'mechanism', 'howToConfirm', 'confidence'],
      },
    },
  },
  required: ['hypotheses'],
}

const CLUSTERS = {
  type: 'object',
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rootCause: { type: 'string' },
          location: { type: 'string' },
          mechanism: { type: 'string' },
          howToConfirm: { type: 'string' },
          supportingAngles: { type: 'array', items: { type: 'string' } },
        },
        required: ['rootCause', 'location', 'mechanism', 'howToConfirm', 'supportingAngles'],
      },
    },
  },
  required: ['clusters'],
}

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['refuted', 'confirmed', 'uncertain'] },
    evidence: { type: 'string' },
    betterExplanation: { type: 'string' },
  },
  required: ['verdict', 'evidence'],
}

const input = typeof args === 'string' ? fromText(args, 'bug') : (args || {})
if (!input.bug) throw new Error('investigate: describe the bug (args.bug, or text after /laa:investigate)')
const angles = input.angles && input.angles.length ? input.angles : DEFAULT_ANGLES
const brief = [
  `BUG: ${input.bug}`,
  input.repro ? `REPRODUCTION: ${input.repro}` : '',
  input.context ? `CONTEXT: ${input.context}` : '',
].filter(Boolean).join('\n\n')

phase('Investigate')
const perAngle = await parallel(angles.map(angle => () =>
  spawn(`${brief}\n\nYour assigned angle: **${angle}**. Stay on this angle; other investigators cover the rest.`,
    { label: `investigate:${angle}`, phase: 'Investigate', agentType: 'laa:investigator', schema: HYPOTHESES })
    .then(r => r && r.hypotheses.map(h => ({ ...h, angle })))))
const all = perAngle.filter(Boolean).flat()
log(`${all.length} hypotheses from ${angles.length} angles`)
if (!all.length) {
  return {
    hypotheses: [],
    note: 'No investigator produced a hypothesis. Gather more evidence (logs, repro) and rerun.',
    report: render(['**▲ No hypotheses** · gather logs or a reproduction and rerun']),
    degraded,
  }
}

// Barrier is intentional: clustering needs every angle's hypotheses at once.
phase('Cluster')
const clustered = await agent(
  `${brief}\n\nThese hypotheses came from independent investigators. Merge ones describing the same root cause, ` +
  `drop any that do not explain the exact symptom, and return at most 5 clusters ordered by likelihood.\n\n` +
  JSON.stringify(all, null, 2),
  { label: 'cluster', phase: 'Cluster', model: 'opus', effort: 'medium', schema: CLUSTERS })
const clusters = (clustered && clustered.clusters) || []

const LENSES = input.thorough
  ? ['code-path: read the implicated code and callers', 'reproduction: run or write a check that would fail if this were the cause', 'alternative: find a different explanation that fits the symptom better']
  : ['code-path: read the implicated code and callers', 'reproduction: run or write a check that would fail if this were the cause']

phase('Verify')
const verified = await parallel(clusters.map((c, i) => () =>
  parallel(LENSES.map(lens => () =>
    spawn(`${brief}\n\nCLAIMED ROOT CAUSE: ${c.rootCause}\nLOCATION: ${c.location}\nMECHANISM: ${c.mechanism}\n\n` +
      `Try to REFUTE this claim using the ${lens} lens.`,
      { label: `verify:${i + 1}:${lens.split(':')[0]}`, phase: 'Verify', agentType: 'laa:verifier', ...(input.thorough && { effort: 'xhigh' }), schema: VERDICT })))
    .then(vs => {
      const votes = vs.filter(Boolean)
      const confirmed = votes.filter(v => v.verdict === 'confirmed').length
      const refuted = votes.filter(v => v.verdict === 'refuted').length
      return { ...c, confirmed, refuted, survives: confirmed >= 1 && refuted < Math.ceil(votes.length / 2), votes }
    })))

const ranked = verified.filter(Boolean).sort((a, b) => (b.confirmed - b.refuted) - (a.confirmed - a.refuted))
const survivors = ranked.filter(r => r.survives).length
log(`${survivors}/${ranked.length} root causes survived verification`)

const report = render([
  `**${survivors} of ${ranked.length} root causes survived verification** · ${angles.length} angles`,
  ...ranked.map(c => c.survives
    ? `- ✓ \`${c.location}\` ${c.rootCause} · ${c.confirmed} confirmed, ${c.refuted} refuted → ${c.howToConfirm}`
    : `- ✗ \`${c.location}\` ${c.rootCause} · refuted`),
])
return { hypotheses: ranked, report, degraded }

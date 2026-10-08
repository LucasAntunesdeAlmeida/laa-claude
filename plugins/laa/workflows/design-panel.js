export const meta = {
  name: 'design-panel',
  description: 'Engine · architecture judge panel behind /laa:build and /laa:feature: one architect per lens, scored by judges, synthesized, then deep-dived by data, API, security, perf, and infra specialists',
  whenToUse: 'Called by /laa:build and /laa:feature, or typed as /laa:design-panel <requirements> for a standalone architecture decision. args: { requirements, context?, lenses? }',
  phases: [
    { title: 'Propose', detail: 'one architect per lens' },
    { title: 'Judge', detail: 'independent judges score every proposal', model: 'opus' },
    { title: 'Synthesize', detail: 'merge the winner with the best ideas from the others' },
    { title: 'Deep-dive', detail: 'data model, API contract, threat model, scale risks, infra' },
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

const DEFAULT_LENSES = [
  'simplicity and delivery speed: smallest thing that works, fewest moving parts',
  'scale and reliability: what survives 100x growth and partial outages',
  'cost and operability: cheapest to run and easiest for a small team to operate',
]

const SCORES = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposal: { type: 'integer', description: '1-based proposal index' },
          fit: { type: 'integer', minimum: 1, maximum: 10 },
          simplicity: { type: 'integer', minimum: 1, maximum: 10 },
          risk: { type: 'integer', minimum: 1, maximum: 10, description: '10 = lowest risk' },
          cost: { type: 'integer', minimum: 1, maximum: 10, description: '10 = cheapest' },
          evolvability: { type: 'integer', minimum: 1, maximum: 10 },
          bestIdeas: { type: 'array', items: { type: 'string' } },
          fatalFlaws: { type: 'array', items: { type: 'string' } },
        },
        required: ['proposal', 'fit', 'simplicity', 'risk', 'cost', 'evolvability', 'bestIdeas', 'fatalFlaws'],
      },
    },
  },
  required: ['scores'],
}

const input = typeof args === 'string' ? fromText(args, 'requirements') : (args || {})
if (!input.requirements) throw new Error('design-panel: describe the requirements (args.requirements, or text after /laa:design-panel)')
const lenses = input.lenses && input.lenses.length ? input.lenses : DEFAULT_LENSES
const brief = `REQUIREMENTS:\n${input.requirements}` + (input.context ? `\n\nEXISTING SYSTEM CONTEXT:\n${input.context}` : '')

phase('Propose')
const proposals = (await parallel(lenses.map((lens, i) => () =>
  spawn(`${brief}\n\nOptimize for this lens: **${lens}**. Commit to it; other architects are covering other lenses.`,
    { label: `architect:${i + 1}`, phase: 'Propose', agentType: 'laa:architect' })
    .then(text => text && { lens, text })))).filter(Boolean)
if (!proposals.length) throw new Error('design-panel: no architect returned a proposal')

// Barrier is intentional: judges compare all proposals side by side.
const listing = proposals.map((p, i) => `=== PROPOSAL ${i + 1} (lens: ${p.lens}) ===\n${p.text}`).join('\n\n')
phase('Judge')
const judgeLenses = ['a pragmatic CTO of a 5-person startup', 'a principal engineer who will be on call for this system']
const judgments = (await parallel(judgeLenses.map((who, j) => () =>
  spawn(`${brief}\n\nYou are ${who}. Score every proposal against the requirements. Be critical.\n\n${listing}`,
    { label: `judge:${j + 1}`, phase: 'Judge', model: 'opus', effort: 'high', schema: SCORES })))).filter(Boolean)

const totals = proposals.map((_, i) => {
  const mine = judgments.flatMap(j => j.scores).filter(s => s.proposal === i + 1)
  const sum = mine.reduce((acc, s) => acc + s.fit * 2 + s.simplicity + s.risk + s.cost + s.evolvability, 0)
  return { proposal: i + 1, lens: proposals[i].lens, score: mine.length ? sum / mine.length : 0 }
}).sort((a, b) => b.score - a.score)
const winner = totals[0].proposal
log(`Winner: proposal ${winner} (${totals[0].lens}) score ${totals[0].score.toFixed(1)}`)

phase('Synthesize')
const blueprint = await agent(
  `${brief}\n\nProposal ${winner} won the judge panel. Produce the FINAL blueprint: start from proposal ${winner}, ` +
  `graft in the best ideas the judges called out from the others, and fix every fatal flaw they found. ` +
  `Keep the same output structure (summary, components, data model, flows, decisions, failure modes, build sequence with parallelizable items, cost).\n\n` +
  `${listing}\n\n=== JUDGE SCORES ===\n${JSON.stringify(judgments, null, 2)}`,
  { label: 'synthesize', phase: 'Synthesize', agentType: 'laa:architect' })

phase('Deep-dive')
const specialists = [
  { key: 'dataModel', agentType: 'laa:data-modeler', ask: 'Design the full data model and migration plan for this blueprint.' },
  { key: 'api', agentType: 'laa:api-designer', ask: 'Design the API and event contracts for this blueprint.' },
  { key: 'threatModel', agentType: 'laa:security-reviewer', ask: 'Threat-model this blueprint (STRIDE over its data flows). Prioritize cross-tenant access and authz.' },
  { key: 'scaleRisks', agentType: 'laa:perf-reviewer', ask: 'Identify the scale and performance risks in this blueprint and how to mitigate them.' },
  { key: 'infra', agentType: 'laa:platform-engineer', ask: 'Design mode: the deployment topology, environments, CI/CD pipeline, and observability (logs, metrics, traces, alerts) for this blueprint at MVP scale, with the path to grow and a monthly cost estimate.' },
]
const dives = await parallel(specialists.map(s => () =>
  spawn(`${brief}\n\n=== BLUEPRINT ===\n${blueprint}\n\n${s.ask}`,
    { label: s.key, phase: 'Deep-dive', agentType: s.agentType })
    .then(text => ({ key: s.key, text }))))

const result = { blueprint, ranking: totals, judgments }
for (const d of dives.filter(Boolean)) result[d.key] = d.text

const DIVE_NAMES = { dataModel: 'data model', api: 'API', threatModel: 'threat model', scaleRisks: 'scale risks', infra: 'infra' }
const returned = dives.filter(d => d && d.text).map(d => DIVE_NAMES[d.key])
const report = render([
  `**✓ Proposal ${winner} wins** · ${totals[0].lens} · score ${totals[0].score.toFixed(1)}`,
  ...totals.map((t, i) => `- ${i + 1}. ${t.lens} · ${t.score.toFixed(1)}`),
  `- Deep-dives: ${returned.length ? returned.join(', ') : 'none'}`,
])
return { ...result, report, degraded }

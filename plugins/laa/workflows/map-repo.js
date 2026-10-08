export const meta = {
  name: 'map-repo',
  description: 'Engine · parallel repo mapping behind /laa:adopt: one explorer per subsystem, then a project map and recommended repo-specific assets',
  whenToUse: 'Called by /laa:adopt, or typed as /laa:map-repo [focus]. args: { areas?: [{ name, paths }], focus?, codeIntel? }',
  phases: [
    { title: 'Scout', detail: 'identify subsystems', model: 'sonnet' },
    { title: 'Explore', detail: 'one explorer per subsystem' },
    { title: 'Synthesize', detail: 'project map + automation recommendations', model: 'sonnet' },
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

const AREAS = {
  type: 'object',
  properties: {
    stack: { type: 'string', description: 'languages, frameworks, DB, infra, with versions' },
    codeIntel: { type: 'string', description: 'code-intelligence tool in use (e.g. "graphify (graphify-out/graph.json)") or "none"' },
    commands: { type: 'object', properties: { build: { type: 'string' }, test: { type: 'string' }, lint: { type: 'string' }, run: { type: 'string' } } },
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } },
        required: ['name', 'paths'],
      },
    },
  },
  required: ['stack', 'areas'],
}

const SYNTH = {
  type: 'object',
  properties: {
    projectMap: { type: 'string', description: 'full Markdown content for .claude/laa/project-map.md' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['agent', 'skill', 'workflow', 'hook', 'claude-md'] },
          name: { type: 'string' },
          purpose: { type: 'string' },
          evidence: { type: 'string', description: 'what in the repo justifies it, with path references' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['kind', 'name', 'purpose', 'evidence', 'priority'],
      },
    },
  },
  required: ['projectMap', 'recommendations'],
}

const input = typeof args === 'string' ? fromText(args, 'focus') : (args || {})

phase('Scout')
let scout = { stack: 'unknown', areas: input.areas || [] }
if (!scout.areas.length) {
  scout = await agent(
    'Identify this repository\'s stack (with versions from manifests/lockfiles), its build/test/lint/run commands, and split it into at most 8 ' +
    'subsystems worth exploring separately (by bounded context or top-level module, not by file type). Skip vendored and generated code.\n\n' +
    (input.codeIntel ? `CODE INTELLIGENCE (chosen by the user): ${input.codeIntel}. ` : 'Report the code-intelligence tool in use as codeIntel: graphify if graphify-out/graph.json exists, else "none". ') +
    'If graphify is in use, run `graphify update .` first (incremental, no LLM; you are the only agent allowed to), then read ' +
    'graphify-out/GRAPH_REPORT.md and use its communities as candidate subsystems: merge tiny ones, split oversized ones.',
    { label: 'scout', phase: 'Scout', model: 'sonnet', effort: 'low', schema: AREAS })
}
const codeIntel = input.codeIntel || scout.codeIntel || 'none'
log(`Stack: ${scout.stack}. Code intelligence: ${codeIntel}. Exploring ${scout.areas.length} area(s)`)

const toolHint = codeIntel === 'none' ? '' : ` Code intelligence: ${codeIntel} (already refreshed; do not update it).`
const maps = await pipeline(scout.areas,
  a => spawn(`Map the "${a.name}" subsystem (${a.paths.join(', ')}).${toolHint}${input.focus ? ` Pay extra attention to: ${input.focus}` : ''}`,
    { label: `explore:${a.name}`, phase: 'Explore', agentType: 'laa:explorer' })
    .then(text => text && `### ${a.name}\n${text}`))

// Barrier is intentional: the map and recommendations need every subsystem at once.
phase('Synthesize')
const synth = await agent(
  `STACK: ${scout.stack}\nCOMMANDS: ${JSON.stringify(scout.commands || {})}\nCODE INTELLIGENCE: ${codeIntel}\n\nSUBSYSTEM MAPS:\n\n${maps.filter(Boolean).join('\n\n')}\n\n` +
  'Write .claude/laa/project-map.md content: stack, commands, a "## Code intelligence" section (the tool, how to refresh it, how agents query it; ' +
  'or "none (grep)"), architecture overview, subsystem table (name, paths, purpose, key files), ' +
  'cross-cutting conventions (errors, logging, DI, config, testing), domain glossary, and known risks. Keep it under ~250 lines; link to files, do not paste code.\n\n' +
  'Then recommend repo-specific automations that generic tooling would miss: e.g. a domain-expert agent for a complex bounded context, ' +
  'a skill encoding a repeated multi-step procedure (adding an endpoint, a migration, a new tenant setting), a workflow for a repeatable ' +
  'fan-out over many similar units (audit every handler for tenant checks, review each bounded context), a hook that enforces a convention ' +
  '(format on edit, block edits to generated code), or CLAUDE.md rules. Every recommendation must cite evidence from the maps. Max 8, highest value first.',
  { label: 'synthesize', phase: 'Synthesize', model: 'sonnet', effort: 'high', schema: SYNTH })

const TAG = { high: 'HIGH', medium: 'MED', low: 'LOW' }
const report = render([
  `**✓ Mapped ${scout.areas.length} areas** · ${scout.stack} · code intelligence: ${codeIntel}`,
  ...((synth && synth.recommendations) || []).map(r => `- \`${TAG[r.priority]}\` ${r.kind} \`${r.name}\`: ${r.purpose}`),
])
return { stack: scout.stack, commands: scout.commands || {}, ...synth, report, degraded }

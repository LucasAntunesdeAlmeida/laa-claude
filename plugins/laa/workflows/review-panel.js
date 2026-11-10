export const meta = {
  name: 'review-panel',
  description: 'Engine · multi-dimension review behind /laa:review: correctness, completeness, security, perf, and stack or practice reviewers, every finding adversarially verified',
  whenToUse: 'Called by /laa:review and at the end of /laa:feature and /laa:build milestones, or typed as /laa:review-panel [base-ref | review focus]. args: { base?, target?, workdir?, requirements?, extraReviewers?, thorough? }',
  phases: [
    { title: 'Review', detail: 'one reviewer per dimension' },
    { title: 'Verify', detail: 'skeptics try to refute each finding' },
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

// A stage pinned to `fable` reruns once on `opus` when it throws or comes back empty: accounts and providers
// without Fable reject the call, and losing the stage would lose the run. A stage the user skips looks the
// same from here, so it is rerun too.
const orOpus = (prompt, opts) => {
  const rerun = () => {
    log(`${opts.label}: no result on ${opts.model}; rerunning on opus`)
    return spawn(prompt, { ...opts, model: 'opus' })
  }
  return agent(prompt, opts).then(r => (r == null ? rerun() : r), rerun)
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          title: { type: 'string' },
          scenario: { type: 'string', description: 'concrete input/state leading to wrong behavior' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'line', 'title', 'scenario', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['refuted', 'confirmed', 'uncertain'] },
    evidence: { type: 'string' },
  },
  required: ['verdict', 'evidence'],
}

let input = typeof args === 'string' ? fromText(args, 'requirements') : (args || {})
// Typed as one word (`main`, `origin/develop`, a SHA): that's the base ref, not a review focus.
if (typeof args === 'string' && input.requirements && /^\S+$/.test(input.requirements)) input = { base: input.requirements }
const target = input.target || 'HEAD'
const diff = input.base
  ? `Review the changes in \`git diff ${input.base}...${target}\``
  : `Review the changes in \`${target}\` against its merge base with the default branch (\`git symbolic-ref refs/remotes/origin/HEAD\`, ` +
    'else main or master); if the branch has no commits of its own, review the uncommitted changes (`git diff HEAD`)'
const where = input.workdir ? `The code under review is checked out at ${input.workdir}: cd there before running git or reading files. ` : ''
const scope = `${where}${diff} (read surrounding code, not just hunks).` +
  (input.requirements ? `\n\nREQUIREMENTS / FOCUS:\n${input.requirements}` : '')

const DIMENSIONS = [
  { key: 'correctness', agentType: 'laa:reviewer', ask: 'Focus on correctness: logic errors, error handling, nil/null paths, transactions, races, broken invariants.' },
  { key: 'completeness', agentType: 'laa:reviewer', ask: 'Focus on completeness and conventions: unmet acceptance criteria, missing tests for the edge cases this change introduces (empty, max, concurrent, other tenant), deviations from repo patterns, and violations of the CLAUDE.md files that apply to the changed paths (the root one, plus any in a changed file\'s directory or its parents). Quote the rule a finding breaks.' },
  { key: 'security', agentType: 'laa:security-reviewer', ask: 'Security review of this diff.' },
  { key: 'performance', agentType: 'laa:perf-reviewer', ask: 'Performance review of this diff.' },
  ...(input.extraReviewers || []).map(t => ({ key: t.split(':').pop(), agentType: t, ask: 'Review this change from your specialty (stack or practice).' })),
]

// What every reviewer leaves out, so the panel reports signal only.
const SKIP = 'Report only issues this diff introduces or makes worse. Skip pre-existing issues in code the diff ' +
  "doesn't change, pure style and formatting issues, checks this repo's own CI already enforces (its configured linters, " +
  "formatter, type checker), pedantic nitpicks a senior engineer wouldn't raise, and generic complaints (\"add more tests\", " +
  '"consider security") not tied to a concrete failure in this change. None of these skips ever covers a correctness, ' +
  'security, or performance defect: report a real bug even when some linter could also flag it.'

// Verdicts fall in three buckets. Confirmed or refuted needs at least half of the requested votes and more
// votes than the opposite verdict. Everything else (uncertain verdicts, verifier errors that return null,
// split votes) is unverified: reported separately, never dropped and never counted as refuted.
const classify = (vs, requested) => {
  const votes = vs.filter(Boolean)
  const confirmed = votes.filter(v => v.verdict === 'confirmed').length
  const refuted = votes.filter(v => v.verdict === 'refuted').length
  const status = confirmed * 2 >= requested && confirmed > refuted ? 'confirmed'
    : refuted * 2 >= requested && refuted > confirmed ? 'refuted'
      : 'unverified'
  return { status, confirmed, refuted, uncertain: votes.length - confirmed - refuted, errored: requested - votes.length, votes }
}

// A thorough review sends three skeptics per finding, each with its own way of attacking the claim. Three
// identical prompts tend to agree for the same reason, so they settle less than three different checks do.
// They run on `fable` (see orOpus): thorough is for auth, payments, and migrations, where a wrong verdict costs most.
const LENSES = [
  'code-path: read the flagged code, its callers, and the framework behavior it relies on',
  'reproduction: run or write a check that would fail if the issue were real',
  'pre-existing: compare with the base version, and look for a guard elsewhere that already prevents it',
]
const verify = input.thorough ? orOpus : spawn

// Dedupe within a dimension only: nearby lines from the same reviewer are one finding. Two dimensions
// flagging the same spot usually report different issues (a missing tenant check next to a nil path), so both stay.
const key = f => `${f.dimension}:${f.file}:${Math.round(f.line / 5)}`
const seen = new Set()

// Pipeline: each dimension's findings go to verification as soon as that dimension finishes.
const results = await pipeline(DIMENSIONS,
  d => spawn(`${scope}\n\n${d.ask}\n\n${SKIP}\n\nOnly report findings you would bet on.`,
    { label: `review:${d.key}`, phase: 'Review', agentType: d.agentType, schema: FINDINGS })
    .then(r => (r ? r.findings : []).map(f => ({ ...f, dimension: d.key }))),
  findings => {
    const fresh = findings.filter(f => !seen.has(key(f)) && (seen.add(key(f)), true))
    const votesPer = input.thorough ? LENSES.length : 1
    return parallel(fresh.map(f => () =>
      parallel(Array.from({ length: votesPer }, (_, v) => () =>
        verify(`${scope}\n\nCLAIMED ISSUE (${f.severity}) at ${f.file}:${f.line}: ${f.title}\nSCENARIO: ${f.scenario}\n\n` +
          `Try to REFUTE it${input.thorough ? ` through the ${LENSES[v]} lens` : ''}. ` +
          'An issue that already existed before this diff, and that the diff does not make worse, counts as refuted.',
          { label: `verify:${f.file.split('/').pop()}:${f.line}${votesPer > 1 ? `#${v + 1}` : ''}`, phase: 'Verify', agentType: 'laa:verifier', ...(input.thorough && { model: 'fable', effort: 'xhigh' }), schema: VERDICT })))
        .then(vs => ({ ...f, ...classify(vs, votesPer) }))))
  })

const order = { critical: 0, high: 1, medium: 2, low: 3 }
const rank = { confirmed: 0, unverified: 1, refuted: 2 }
// Two dimensions can still report the very same issue: same file, a line within 2, and the same title once
// case and punctuation are ignored. Their verifiers may disagree, so merge regardless of status: keep the best
// status (confirmed > unverified > refuted), raise to the highest severity, and list every dimension that
// found it. Anything that differs stays a separate finding.
const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const merged = []
for (const f of results.filter(Boolean).flat().filter(Boolean)
  .sort((a, b) => rank[a.status] - rank[b.status] || order[a.severity] - order[b.severity])) {
  const same = merged.find(m => m.file === f.file && Math.abs(m.line - f.line) <= 2 && norm(m.title) === norm(f.title))
  if (!same) { merged.push({ ...f, dimensions: [f.dimension] }); continue }
  same.dimensions.push(f.dimension)
  if (order[f.severity] < order[same.severity]) same.severity = f.severity
}
merged.sort((a, b) => order[a.severity] - order[b.severity])
const confirmed = merged.filter(f => f.status === 'confirmed')
const unverified = merged.filter(f => f.status === 'unverified')
const refutedCount = merged.filter(f => f.status === 'refuted').length
if (refutedCount) log(`${refutedCount} finding(s) refuted by verifiers and dropped`)
if (unverified.length) log(`${unverified.length} finding(s) unverified: uncertain verdicts or verifier errors`)

const TAG = { critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW' }
const dims = DIMENSIONS.map(d => d.key).join(', ')
const line = f => `- \`${TAG[f.severity]}\` \`${f.file}:${f.line}\` ${f.title} → ${f.fix}`
const why = f => [
  f.uncertain && `${f.uncertain} uncertain`,
  f.errored && `${f.errored} verifier ${f.errored === 1 ? 'error' : 'errors'}`,
].filter(Boolean).join(', ') || 'split vote'
const counts = `${unverified.length ? `${unverified.length} unverified · ` : ''}${refutedCount} refuted · ${dims}`
const report = render([
  confirmed.length
    ? `**${confirmed.length} ${confirmed.length === 1 ? 'finding' : 'findings'}** · ${counts}`
    : unverified.length ? `**▲ No confirmed findings** · ${counts}` : `**✓ No findings** · ${counts}`,
  ...confirmed.map(line),
  ...(unverified.length ? ['', `**▲ ${unverified.length} unverified** · verifiers couldn't settle these; check them by hand`] : []),
  ...unverified.map(f => `${line(f)} · ${why(f)}`),
])
return { confirmed, unverified, refutedCount, report, degraded }

export const meta = {
  name: 'implement-slices',
  description: 'Implement independent work items in parallel git worktrees, review each branch, and apply one round of fixes',
  whenToUse: 'Called by /laa:build and /laa:feature once a plan is approved, or typed as /laa:implement-slices <task> to build one task in a worktree with review. args: { base?, slices: [{ id, title, spec, files?, acceptance? }], conventions? }',
  phases: [
    { title: 'Implement', detail: 'one implementer per slice, each in its own worktree' },
    { title: 'Review', detail: 'reviewer per branch' },
    { title: 'Fix', detail: 'address confirmed review findings' },
  ],
}

// Plugin agent types resolve as '<plugin>:<agent>'. If resolution fails (plugin renamed, older Claude Code),
// fall back to a general-purpose agent told to follow that agent's role, so the workflow still completes.
const spawn = (prompt, opts) => agent(prompt, opts).catch(err => {
  if (!opts.agentType) throw err
  log(`agentType ${opts.agentType} unavailable (${err.message}); falling back to default agent`)
  const { agentType, ...rest } = opts
  return agent(`Act as the ${agentType.split(':').pop()} specialist from the laa toolkit.\n\n${prompt}`, rest)
})

// Skills pass args as an object. Typing `/laa:<workflow> <text>` passes plain text instead (and an
// object sometimes arrives JSON-encoded), so accept all three.
const fromText = (raw, key) => {
  const text = raw.trim()
  if (text.startsWith('{')) {
    try { return JSON.parse(text) } catch (e) { /* not JSON: treat as plain text */ }
  }
  return text ? { [key]: text } : {}
}

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    branch: { type: 'string', description: 'branch name holding the committed work' },
    baseCommit: { type: 'string', description: 'commit the branch started from' },
    worktreePath: { type: 'string', description: 'absolute path of the worktree you worked in' },
    summary: { type: 'string' },
    commands: { type: 'array', items: { type: 'string' }, description: 'build/test commands run and their outcome' },
    decisions: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'branch', 'baseCommit', 'worktreePath', 'summary', 'commands'],
}

const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'approve-with-nits', 'request-changes'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          location: { type: 'string' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'location', 'issue', 'fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const input = typeof args === 'string' ? fromText(args, 'task') : (args || {})
// Typed as `/laa:implement-slices <task>`: run the task as a single slice.
if (input.task && !(input.slices && input.slices.length)) {
  const id = input.task.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'task'
  input.slices = [{ id, title: input.task.slice(0, 80), spec: input.task }]
}
if (!input.slices || !input.slices.length) throw new Error('implement-slices: pass args.slices, or type /laa:implement-slices <task>')
const base = input.base || null
const conventions = input.conventions ? `\n\nREPO CONVENTIONS:\n${input.conventions}` : ''

const describe = s => [
  `WORK ITEM ${s.id}: ${s.title}`,
  s.spec,
  s.files && s.files.length ? `FILES IN SCOPE: ${s.files.join(', ')}` : '',
  s.acceptance && s.acceptance.length ? `ACCEPTANCE CRITERIA:\n- ${s.acceptance.join('\n- ')}` : '',
].filter(Boolean).join('\n\n')

const results = await pipeline(input.slices,
  s => spawn(
    `${describe(s)}${conventions}\n\nIn your worktree, create branch \`laa/${s.id}\` from ${base ? `\`${base}\`` : 'the current commit'} ` +
    '(add a numeric suffix if that branch exists) and record the commit it starts from (`git rev-parse HEAD`) as baseCommit. ' +
    'Implement, run build + tests until green, and commit. ' +
    `Report the branch name, baseCommit, and your worktree's absolute path (\`git rev-parse --show-toplevel\`).`,
    { label: `implement:${s.id}`, phase: 'Implement', agentType: 'laa:implementer', isolation: 'worktree', schema: RESULT }),

  (impl, s) => {
    if (!impl || impl.status !== 'done') return { slice: s.id, impl, review: null }
    return spawn(
      `${describe(s)}\n\nReview branch \`${impl.branch}\` (worktree: ${impl.worktreePath}) with \`git -C "${impl.worktreePath}" diff ${impl.baseCommit}...HEAD\`. ` +
      `Check it meets every acceptance criterion and stays inside its scope.`,
      { label: `review:${s.id}`, phase: 'Review', agentType: 'laa:reviewer', schema: REVIEW })
      .then(review => ({ slice: s.id, impl, review }))
  },

  (r, s) => {
    if (!r.review || r.review.verdict !== 'request-changes') return r
    const must = r.review.findings.filter(f => f.severity === 'critical' || f.severity === 'high')
    if (!must.length) return r
    return spawn(
      `${describe(s)}\n\nWork ONLY inside the existing worktree at ${r.impl.worktreePath} (cd there first; branch ${r.impl.branch}). ` +
      `Fix these review findings, rerun build + tests, and commit:\n${JSON.stringify(must, null, 2)}`,
      { label: `fix:${s.id}`, phase: 'Fix', agentType: 'laa:implementer', schema: RESULT })
      .then(fix => ({ ...r, fix }))
  })

const summary = results.map((r, i) => r || { slice: input.slices[i].id, impl: null, review: null })
const blocked = summary.filter(r => !r.impl || r.impl.status !== 'done').map(r => r.slice)
if (blocked.length) log(`Blocked or failed slices: ${blocked.join(', ')}`)
return { base, results: summary, blocked }

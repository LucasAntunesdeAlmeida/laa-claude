export const meta = {
  name: 'migrate-sites',
  description: 'Engine · site finder and batch transformer behind /laa:migrate. Typed alone it only finds the sites and plans batches',
  whenToUse: 'Called by /laa:migrate, or typed as /laa:migrate-sites <change> to only find the sites. args: { change, recipe?, verify?, discoverOnly?, batches?: [{ id, files, sites? }], base?, batchSize? }',
  phases: [
    { title: 'Discover', detail: 'two finders search in different ways' },
    { title: 'Transform', detail: 'one implementer per batch, each in its own worktree' },
    { title: 'Verify', detail: 'a skeptic checks each batch' },
    { title: 'Fix', detail: 'one round of fixes for refuted batches' },
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

const SITES = {
  type: 'object',
  properties: {
    sites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'repo-relative path' },
          line: { type: 'integer' },
          note: { type: 'string', description: 'what must change here' },
        },
        required: ['file', 'note'],
      },
    },
  },
  required: ['sites'],
}

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    branch: { type: 'string' },
    baseCommit: { type: 'string', description: 'commit the branch started from' },
    worktreePath: { type: 'string', description: 'absolute path of the worktree you worked in' },
    summary: { type: 'string' },
    commands: { type: 'array', items: { type: 'string' }, description: 'build/test commands run and their outcome' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'sites left unchanged, each with the reason' },
  },
  required: ['status', 'branch', 'baseCommit', 'worktreePath', 'summary', 'commands'],
}

const CHECK = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['refuted', 'confirmed', 'uncertain'] },
    problems: { type: 'array', items: { type: 'string' }, description: 'each with path:line' },
  },
  required: ['verdict', 'problems'],
}

const input = typeof args === 'string' ? { ...fromText(args, 'change'), discoverOnly: !args.trim().startsWith('{') } : (args || {})
if (!input.change) throw new Error('migrate-sites: describe the change (args.change, or text after /laa:migrate-sites)')
const base = input.base || null
const batchSize = input.batchSize || 8
const brief = [
  `CHANGE: ${input.change}`,
  input.recipe ? `RECIPE (from an approved pilot; follow it exactly):\n${input.recipe}` : '',
  input.verify ? `VERIFY WITH: ${input.verify}` : '',
].filter(Boolean).join('\n\n')

let batches = input.batches
if (!batches || !batches.length) {
  phase('Discover')
  const METHODS = [
    'by symbol: imports, type and function references, and call sites (start from `graphify affected "<Symbol>"` when graphify-out/graph.json exists, ' +
      'then confirm with the language toolchain or exact-identifier grep, since a graph can miss dynamic references; without a graph, use the toolchain or grep)',
    'by text and config: string literals, config and build files, CI pipelines, Dockerfiles, scripts, and docs that reference the old thing',
  ]
  const found = await parallel(METHODS.map((m, i) => () =>
    spawn(`${brief}\n\nFind EVERY site in this repository that must change. Search ${m}. Skip vendored and generated code. Report each site once.`,
      { label: `discover:${i + 1}`, phase: 'Discover', agentType: 'laa:explorer', schema: SITES })))

  // Barrier is intentional: merge both finders' results before packing files into batches.
  const byFile = new Map()
  for (const s of found.filter(Boolean).flatMap(r => r.sites)) {
    const file = s.file.replace(/\\/g, '/').replace(/^\.\//, '')
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file).push({ ...s, file })
  }
  // Pack files in path order so neighbours share a batch. Batches never share a file, so their branches merge cleanly.
  const packed = []
  let current = []
  let currentDir = null
  for (const file of [...byFile.keys()].sort()) {
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
    if (current.length >= batchSize || (current.length && dir !== currentDir && current.length >= batchSize / 2)) {
      packed.push(current)
      current = []
    }
    current.push(file)
    currentDir = dir
  }
  if (current.length) packed.push(current)
  batches = packed.map((files, i) => ({
    id: `migrate-${String(i + 1).padStart(2, '0')}`,
    files,
    sites: files.flatMap(f => byFile.get(f)),
  }))
  log(`${byFile.size} file(s) with sites, packed into ${batches.length} batch(es) of up to ${batchSize} files`)
  if (input.discoverOnly || !batches.length) {
    const siteCount = batches.reduce((n, b) => n + b.sites.length, 0)
    const report = render(batches.length
      ? [
        `**${siteCount} sites in ${byFile.size} files** · ${batches.length} batches of up to ${batchSize} files`,
        ...batches.map(b => `- \`${b.id}\` ${b.files.length} files: ${b.files.slice(0, 3).join(', ')}${b.files.length > 3 ? ', …' : ''}`),
      ]
      : ['**✓ No sites found** · nothing left to migrate'])
    return { change: input.change, siteCount, batches, report, degraded }
  }
}

const results = await pipeline(batches,
  b => spawn(
    `${brief}\n\nBATCH ${b.id}: change ONLY these files:\n- ${b.files.join('\n- ')}` +
    (b.sites && b.sites.length ? `\n\nKNOWN SITES:\n${JSON.stringify(b.sites, null, 2)}` : '') +
    `\n\nIn your worktree, create branch \`laa/${b.id}\` from ${base ? `\`${base}\`` : 'the current commit'} (add a numeric suffix if that branch exists) ` +
    'and record the commit it starts from (`git rev-parse HEAD`) as baseCommit. Apply the change to every site in these files, then build and ' +
    'run the tests covering them until green, and commit. Change no behavior beyond the migration. If a site cannot be changed mechanically, ' +
    'leave it and list it in `skipped` with the reason. Report the branch, baseCommit, and your worktree\'s absolute path (`git rev-parse --show-toplevel`).',
    { label: `transform:${b.id}`, phase: 'Transform', agentType: 'laa:implementer', isolation: 'worktree', schema: RESULT }),

  (impl, b) => {
    if (!impl || impl.status !== 'done') return { batch: b.id, impl, check: null }
    return spawn(
      `${brief}\n\nCLAIM: branch \`${impl.branch}\` correctly migrates every site in ${b.files.join(', ')}, touches nothing outside those files, ` +
      `and changes no behavior beyond the migration. Inspect it with \`git -C "${impl.worktreePath}" diff ${impl.baseCommit}...HEAD\`. ` +
      'Try to REFUTE the claim. List each problem with path:line.',
      { label: `verify:${b.id}`, phase: 'Verify', agentType: 'laa:verifier', schema: CHECK })
      .then(check => ({ batch: b.id, impl, check }))
  },

  (r, b) => {
    if (!r.check || r.check.verdict !== 'refuted' || !r.check.problems.length) return r
    return spawn(
      `${brief}\n\nWork ONLY inside the existing worktree at ${r.impl.worktreePath} (cd there first; branch ${r.impl.branch}). ` +
      `Fix these problems in batch ${b.id}, rerun build + tests, and commit:\n- ${r.check.problems.join('\n- ')}`,
      { label: `fix:${b.id}`, phase: 'Fix', agentType: 'laa:implementer', schema: RESULT })
      .then(fix => ({ ...r, fix }))
  })

const summary = results.map((r, i) => r || { batch: batches[i].id, impl: null, check: null })
const ok = r => r.impl && r.impl.status === 'done' && r.check &&
  (r.check.verdict !== 'refuted' || (r.fix && r.fix.status === 'done'))
const needsAttention = summary.filter(r => !ok(r)).map(r => r.batch)
if (needsAttention.length) log(`Batches needing attention: ${needsAttention.join(', ')}`)

const reason = r => !r.impl || r.impl.status !== 'done' ? 'blocked'
  : !r.check ? 'unverified'
    : r.fix ? 'unfixed' : 'refuted'
const n = summary.length
const report = render([
  needsAttention.length
    ? `**▲ ${n - needsAttention.length}/${n} batches verified** · needs attention: ${needsAttention.join(', ')}`
    : `**✓ ${n}/${n} batches verified**`,
  ...summary.map((r, i) => ok(r) ? `- ✓ \`${r.impl.branch}\` ${batches[i].files.length} files` : `- ✗ ${r.batch} ${reason(r)}`),
])
return { change: input.change, base, results: summary, needsAttention, report, degraded }

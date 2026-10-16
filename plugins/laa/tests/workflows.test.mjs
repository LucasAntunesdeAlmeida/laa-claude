// Runs each workflow script against fake agent(), parallel(), pipeline(), phase(), and log() to check
// the rendered `report`, the `degraded` list, and the engine label. Run with `node --test "plugins/laa/tests/*.test.mjs"`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'workflows')
const NAMES = ['design-panel', 'implement-slices', 'investigate', 'map-repo', 'migrate-sites', 'review-panel']
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const source = name => fs.readFileSync(path.join(DIR, `${name}.js`), 'utf8')

// The engine's pipeline: the first stage receives the item, later stages receive (previous result, item).
const pipeline = (items, ...stages) => Promise.all(items.map(async item => {
  let r = item
  let first = true
  for (const st of stages) {
    r = first ? await st(item) : await st(r, item)
    first = false
  }
  return r
}))
const parallel = thunks => Promise.all(thunks.map(f => f()))

// outputs: [labelPrefix, value | (prompt, opts) => value] pairs; the first matching prefix wins.
// reject: agentTypes whose calls fail, to exercise spawn()'s fallback.
async function run(name, args, outputs, reject = []) {
  const calls = []
  const logs = []
  const phases = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    if (opts.agentType && reject.includes(opts.agentType)) throw new Error(`unknown agent type ${opts.agentType}`)
    const hit = outputs.find(([prefix]) => opts.label.startsWith(prefix))
    if (!hit) return null
    return typeof hit[1] === 'function' ? hit[1](prompt, opts) : structuredClone(hit[1])
  }
  const body = source(name).replace('export const meta =', 'const meta =')
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', body)
  const result = await fn(args, agent, parallel, pipeline, p => phases.push(p), m => logs.push(m))
  return { result, calls, logs, phases }
}

test('every workflow labels itself as an engine', () => {
  for (const name of NAMES) {
    // meta is a pure literal, so it evaluates on its own.
    const literal = source(name).match(/^export const meta = (\{[\s\S]*?\n\})/m)[1]
    const meta = new Function(`return ${literal}`)()
    assert.ok(meta.description.startsWith('Engine · '), `${name}: ${meta.description}`)
  }
})

test('review-panel renders confirmed findings by severity with tags and the refuted count', async () => {
  const findings = {
    correctness: [
      { severity: 'medium', file: 'svc/order.go', line: 40, title: 'Order total ignores discounts', scenario: 's', fix: 'apply discounts before tax' },
      { severity: 'low', file: 'svc/order.go', line: 90, title: 'Typo in log message', scenario: 's', fix: 'fix the typo' },
    ],
    security: [{ severity: 'critical', file: 'api/auth.go', line: 12, title: 'Tenant check missing', scenario: 's', fix: 'check the tenant id' }],
  }
  const { result } = await run('review-panel', { base: 'main' }, [
    ['review:', (_, opts) => ({ findings: findings[opts.label.slice('review:'.length)] || [] })],
    ['verify:order.go:90', { verdict: 'refuted', evidence: 'not reachable' }],
    ['verify:', { verdict: 'confirmed', evidence: 'reproduced' }],
  ])
  assert.equal(result.refutedCount, 1)
  assert.deepEqual(result.degraded, [])
  assert.equal(result.report, [
    '**2 findings** · 1 refuted · correctness, completeness, security, performance',
    '- `CRIT` `api/auth.go:12` Tenant check missing → check the tenant id',
    '- `MED` `svc/order.go:40` Order total ignores discounts → apply discounts before tax',
  ].join('\n'))
})

test('review-panel reports no findings', async () => {
  const { result } = await run('review-panel', { base: 'main' }, [['review:', { findings: [] }]])
  assert.deepEqual(result.confirmed, [])
  assert.equal(result.report, '**✓ No findings** · 0 refuted · correctness, completeness, security, performance')
})

test('review-panel says "1 finding" for a single finding', async () => {
  const { result } = await run('review-panel', { base: 'main' }, [
    ['review:correctness', { findings: [{ severity: 'high', file: 'a.go', line: 1, title: 'Nil map write', scenario: 's', fix: 'init the map' }] }],
    ['review:', { findings: [] }],
    ['verify:', { verdict: 'confirmed', evidence: 'e' }],
  ])
  assert.match(result.report, /^\*\*1 finding\*\* · 0 refuted/)
  assert.match(result.report, /- `HIGH` `a.go:1` Nil map write → init the map/)
})

test('review-panel keeps an uncertain single vote out of the confirmed findings', async () => {
  const { result } = await run('review-panel', { base: 'main' }, [
    ['review:correctness', { findings: [{ severity: 'high', file: 'a.go', line: 1, title: 'Nil map write', scenario: 's', fix: 'init the map' }] }],
    ['review:', { findings: [] }],
    ['verify:', { verdict: 'uncertain', evidence: 'could not tell' }],
  ])
  assert.deepEqual(result.confirmed, [])
  assert.equal(result.unverified.length, 1)
  assert.equal(result.refutedCount, 0)
  assert.equal(result.report, [
    '**✓ No findings** · 1 unverified · 0 refuted · correctness, completeness, security, performance',
    '',
    "**▲ 1 unverified** · verifiers couldn't settle these; check them by hand",
    '- `HIGH` `a.go:1` Nil map write → init the map · 1 uncertain',
  ].join('\n'))
})

test('review-panel reports a finding whose verifiers errored as unverified, not refuted', async () => {
  const { result } = await run('review-panel', { base: 'main', thorough: true }, [
    ['review:security', { findings: [{ severity: 'critical', file: 'api/auth.go', line: 12, title: 'Tenant check missing', scenario: 's', fix: 'check the tenant id' }] }],
    ['review:', { findings: [] }],
    ['verify:auth.go:12#1', { verdict: 'confirmed', evidence: 'e' }],
    // #2 and #3 match nothing, so the fake agent returns null, as a failed verifier does.
  ])
  assert.deepEqual(result.confirmed, [])
  assert.equal(result.refutedCount, 0)
  assert.equal(result.unverified.length, 1)
  assert.equal(result.unverified[0].errored, 2)
  assert.match(result.report, /^\*\*✓ No findings\*\* · 1 unverified · 0 refuted/)
  assert.match(result.report, /- `CRIT` `api\/auth\.go:12` Tenant check missing → check the tenant id · 2 verifier errors$/)
})

test('review-panel confirms with a majority of thorough votes and refutes with a majority against', async () => {
  const { result } = await run('review-panel', { base: 'main', thorough: true }, [
    ['review:correctness', {
      findings: [
        { severity: 'high', file: 'a.go', line: 1, title: 'Nil map write', scenario: 's', fix: 'init the map' },
        { severity: 'low', file: 'b.go', line: 50, title: 'Wrong log level', scenario: 's', fix: 'use warn' },
      ],
    }],
    ['review:', { findings: [] }],
    ['verify:a.go:1#3', { verdict: 'uncertain', evidence: 'e' }],
    ['verify:a.go:1', { verdict: 'confirmed', evidence: 'e' }],
    ['verify:b.go:50#1', { verdict: 'confirmed', evidence: 'e' }],
    ['verify:b.go:50', { verdict: 'refuted', evidence: 'e' }],
  ])
  assert.deepEqual(result.confirmed.map(f => f.file), ['a.go'])
  assert.equal(result.refutedCount, 1)
  assert.deepEqual(result.unverified, [])
})

test('review-panel keeps distinct findings from different dimensions at nearby lines', async () => {
  const findings = {
    correctness: [{ severity: 'medium', file: 'api/auth.go', line: 13, title: 'Nil user on expired session', scenario: 's', fix: 'return 401 first' }],
    security: [{ severity: 'critical', file: 'api/auth.go', line: 12, title: 'Tenant check missing', scenario: 's', fix: 'check the tenant id' }],
  }
  const { result } = await run('review-panel', { base: 'main' }, [
    ['review:', (_, opts) => ({ findings: findings[opts.label.slice('review:'.length)] || [] })],
    ['verify:', { verdict: 'confirmed', evidence: 'e' }],
  ])
  assert.equal(result.report, [
    '**2 findings** · 0 refuted · correctness, completeness, security, performance',
    '- `CRIT` `api/auth.go:12` Tenant check missing → check the tenant id',
    '- `MED` `api/auth.go:13` Nil user on expired session → return 401 first',
  ].join('\n'))
})

test('review-panel merges the same issue from two dimensions and keeps the most severe copy', async () => {
  const same = { file: 'svc/order.go', line: 40, title: 'Order total ignores discounts', scenario: 's', fix: 'apply discounts' }
  const findings = {
    correctness: [{ ...same, severity: 'medium' }],
    completeness: [{ ...same, severity: 'high' }],
  }
  const { result } = await run('review-panel', { base: 'main' }, [
    ['review:', (_, opts) => ({ findings: findings[opts.label.slice('review:'.length)] || [] })],
    ['verify:', { verdict: 'confirmed', evidence: 'e' }],
  ])
  assert.equal(result.confirmed.length, 1)
  assert.equal(result.confirmed[0].severity, 'high')
  assert.deepEqual(result.confirmed[0].dimensions, ['completeness', 'correctness'])
})

test('review-panel tells reviewers to skip pre-existing and linter-level issues', async () => {
  const { calls } = await run('review-panel', { base: 'main' }, [['review:', { findings: [] }]])
  const completeness = calls.find(c => c.opts.label === 'review:completeness')
  assert.match(completeness.prompt, /pre-existing/)
  assert.match(completeness.prompt, /linter/)
  assert.match(completeness.prompt, /CLAUDE\.md/)
})

test('investigate reports a root cause whose verifiers errored as unverified, not refuted', async () => {
  const { result } = await run('investigate', { bug: 'b', angles: ['data-flow'] }, [
    ['investigate:', { hypotheses: [{ rootCause: 'x', location: 'a.go:1', mechanism: 'm', howToConfirm: 'h', confidence: 'high' }] }],
    ['cluster', { clusters: [{ rootCause: 'Stale cache', location: 'cache/order.go:8', mechanism: 'm', howToConfirm: 'disable the cache', supportingAngles: ['data-flow'] }] }],
    // No verify: output, so both verifiers return null.
  ])
  assert.equal(result.hypotheses[0].status, 'unverified')
  assert.equal(result.hypotheses[0].errored, 2)
  assert.equal(result.report, [
    '**0 of 1 root causes confirmed** · 1 unverified · 0 refuted · 1 angles',
    '- ▲ `cache/order.go:8` Stale cache · unverified: 0 confirmed, 0 refuted, 2 verifier errors → disable the cache',
  ].join('\n'))
})

test('investigate keeps uncertain verdicts out of the confirmed bucket', async () => {
  const { result } = await run('investigate', { bug: 'b', angles: ['data-flow'] }, [
    ['investigate:', { hypotheses: [{ rootCause: 'x', location: 'a.go:1', mechanism: 'm', howToConfirm: 'h', confidence: 'high' }] }],
    ['cluster', { clusters: [{ rootCause: 'Stale cache', location: 'cache/order.go:8', mechanism: 'm', howToConfirm: 'disable the cache', supportingAngles: ['data-flow'] }] }],
    ['verify:', { verdict: 'uncertain', evidence: 'e' }],
  ])
  assert.equal(result.hypotheses[0].status, 'unverified')
  assert.equal(result.hypotheses[0].survives, false)
  assert.match(result.report, /unverified: 0 confirmed, 0 refuted, 2 uncertain/)
})

test('investigate marks surviving root causes with ✓ and refuted ones with ✗', async () => {
  const { result } = await run('investigate', { bug: 'orders double-charge on retry', angles: ['recent-changes', 'concurrency'] }, [
    ['investigate:', { hypotheses: [{ rootCause: 'x', location: 'a.go:1', mechanism: 'm', howToConfirm: 'h', confidence: 'high' }] }],
    ['cluster', {
      clusters: [
        { rootCause: 'Retry reuses the idempotency key of a failed charge', location: 'pay/retry.go:31', mechanism: 'm', howToConfirm: 'replay a failed charge twice', supportingAngles: ['concurrency'] },
        { rootCause: 'Cache returns a stale order', location: 'cache/order.go:8', mechanism: 'm', howToConfirm: 'disable the cache', supportingAngles: ['recent-changes'] },
      ],
    }],
    ['verify:1:', { verdict: 'confirmed', evidence: 'e' }],
    ['verify:2:', { verdict: 'refuted', evidence: 'e' }],
  ])
  assert.equal(result.hypotheses.length, 2)
  assert.equal(result.report, [
    '**1 of 2 root causes confirmed** · 0 unverified · 1 refuted · 2 angles',
    '- ✓ `pay/retry.go:31` Retry reuses the idempotency key of a failed charge · 2 confirmed, 0 refuted → replay a failed charge twice',
    '- ✗ `cache/order.go:8` Cache returns a stale order · refuted',
  ].join('\n'))
})

test('investigate with no hypotheses still returns a report', async () => {
  const { result } = await run('investigate', 'orders double-charge on retry', [['investigate:', { hypotheses: [] }]])
  assert.deepEqual(result.hypotheses, [])
  assert.ok(result.note)
  assert.equal(result.report, '**▲ No hypotheses** · gather logs or a reproduction and rerun')
  assert.deepEqual(result.degraded, [])
})

test('design-panel names the winner, the ranking, and the deep-dives that returned', async () => {
  const score = (proposal, v) => ({ proposal, fit: v, simplicity: v, risk: v, cost: v, evolvability: v, bestIdeas: [], fatalFlaws: [] })
  const { result } = await run('design-panel', { requirements: 'a booking service', lenses: ['simplicity', 'scale'] }, [
    ['architect:', (_, opts) => `proposal ${opts.label}`],
    ['judge:', { scores: [score(1, 5), score(2, 8)] }],
    ['synthesize', 'final blueprint'],
    ['dataModel', 'tables'],
    ['api', 'endpoints'],
    ['infra', 'topology'],
  ])
  assert.equal(result.blueprint, 'final blueprint')
  assert.equal(result.ranking[0].proposal, 2)
  assert.equal(result.report, [
    '**✓ Proposal 2 wins** · scale · score 48.0',
    '- 1. scale · 48.0',
    '- 2. simplicity · 30.0',
    '- Deep-dives: data model, API, infra',
  ].join('\n'))
})

test('design-panel rotates the proposal order per judge and keeps proposal numbers stable', async () => {
  const score = proposal => ({ proposal, fit: 5, simplicity: 5, risk: 5, cost: 5, evolvability: 5, bestIdeas: [], fatalFlaws: [] })
  const { calls } = await run('design-panel', { requirements: 'a booking service', lenses: ['simplicity', 'scale', 'cost'] }, [
    ['architect:', (_, opts) => `proposal ${opts.label}`],
    ['judge:', { scores: [score(1), score(2), score(3)] }],
    ['synthesize', 'final blueprint'],
  ])
  const order = label => [...calls.find(c => c.opts.label === label).prompt.matchAll(/=== PROPOSAL (\d) \(lens: (\w+)\)/g)]
    .map(m => `${m[1]}:${m[2]}`)
  assert.deepEqual(order('judge:1'), ['1:simplicity', '2:scale', '3:cost'])
  assert.deepEqual(order('judge:2'), ['2:scale', '3:cost', '1:simplicity'])
  assert.deepEqual(order('synthesize'), ['1:simplicity', '2:scale', '3:cost'])
})

test('implement-slices marks a blocked slice with ▲', async () => {
  const { result } = await run('implement-slices', {
    slices: [
      { id: 'orders-api', title: 'Orders API', spec: 's' },
      { id: 'orders-db', title: 'Orders table', spec: 's' },
    ],
  }, [
    ['implement:orders-api', { status: 'done', branch: 'laa/orders-api', baseCommit: 'abc123', worktreePath: '/tmp/wt1', summary: 'ok', commands: [] }],
    ['implement:orders-db', { status: 'blocked', branch: 'laa/orders-db', baseCommit: 'abc123', worktreePath: '/tmp/wt2', summary: 'stuck', commands: [], blockers: ['migration tool missing'] }],
    ['review:', { verdict: 'request-changes', findings: [{ severity: 'high', location: 'a.go:1', issue: 'i', fix: 'f' }] }],
    ['fix:', { status: 'done', branch: 'laa/orders-api', baseCommit: 'abc123', worktreePath: '/tmp/wt1', summary: 'fixed', commands: [] }],
  ])
  assert.deepEqual(result.blocked, ['orders-db'])
  assert.equal(result.report, [
    '**▲ 1/2 slices done** · blocked: orders-db',
    '- ✓ `laa/orders-api` Orders API · review: request-changes · fixed',
    '- ✗ orders-db migration tool missing',
  ].join('\n'))
})

test('implement-slices reports every slice done', async () => {
  const { result } = await run('implement-slices', 'add a health endpoint', [
    ['implement:', { status: 'done', branch: 'laa/add-a-health-endpoint', baseCommit: 'abc', worktreePath: '/tmp/wt', summary: 'ok', commands: [] }],
    ['review:', { verdict: 'approve', findings: [] }],
  ])
  assert.equal(result.report, '**✓ 1/1 slices done**\n- ✓ `laa/add-a-health-endpoint` add a health endpoint · review: approve')
})

test('migrate-sites discoverOnly lists the planned batches', async () => {
  const files = ['pkg/a/one.go', 'pkg/a/two.go', 'pkg/a/three.go', 'pkg/a/four.go', 'pkg/b/five.go']
  const { result } = await run('migrate-sites', { change: 'rename Foo to Bar', discoverOnly: true, batchSize: 4 }, [
    ['discover:1', { sites: files.map(file => ({ file, line: 1, note: 'n' })) }],
    ['discover:2', { sites: [{ file: './pkg/a/one.go', line: 9, note: 'n' }] }],
  ])
  assert.equal(result.siteCount, 6)
  assert.equal(result.batches.length, 2)
  assert.equal(result.report, [
    '**6 sites in 5 files** · 2 batches of up to 4 files',
    '- `migrate-01` 4 files: pkg/a/four.go, pkg/a/one.go, pkg/a/three.go, …',
    '- `migrate-02` 1 files: pkg/b/five.go',
  ].join('\n'))
})

test('migrate-sites with no sites says so', async () => {
  const { result } = await run('migrate-sites', 'rename Foo to Bar', [['discover:', { sites: [] }]])
  assert.equal(result.report, '**✓ No sites found** · nothing left to migrate')
})

test('migrate-sites transform flags batches that need attention', async () => {
  const { result } = await run('migrate-sites', {
    change: 'rename Foo to Bar',
    batches: [{ id: 'migrate-01', files: ['a.go', 'b.go'] }, { id: 'migrate-02', files: ['c.go'] }],
  }, [
    ['transform:', (_, opts) => ({ status: 'done', branch: `laa/${opts.label.slice('transform:'.length)}`, baseCommit: 'abc', worktreePath: '/tmp/wt', summary: 'ok', commands: [] })],
    ['verify:migrate-01', { verdict: 'confirmed', problems: [] }],
    ['verify:migrate-02', { verdict: 'refuted', problems: ['c.go:3 still uses Foo'] }],
    ['fix:', { status: 'blocked', branch: 'laa/migrate-02', baseCommit: 'abc', worktreePath: '/tmp/wt', summary: 'no', commands: [] }],
  ])
  assert.deepEqual(result.needsAttention, ['migrate-02'])
  assert.equal(result.report, [
    '**▲ 1/2 batches verified** · needs attention: migrate-02',
    '- ✓ `laa/migrate-01` 2 files',
    '- ✗ migrate-02 unfixed',
  ].join('\n'))
})

test('map-repo lists the recommendations', async () => {
  const { result } = await run('map-repo', { areas: [{ name: 'billing', paths: ['billing/'] }, { name: 'web', paths: ['web/'] }], codeIntel: 'none' }, [
    ['explore:', 'map'],
    ['synthesize', {
      projectMap: '# Map',
      recommendations: [
        { kind: 'skill', name: 'add-endpoint', purpose: 'Add an HTTP endpoint the way this repo does it', evidence: 'e', priority: 'high' },
        { kind: 'hook', name: 'no-generated-edits', purpose: 'Block edits under gen/', evidence: 'e', priority: 'low' },
      ],
    }],
  ])
  assert.equal(result.projectMap, '# Map')
  assert.equal(result.report, [
    '**✓ Mapped 2 areas** · unknown · code intelligence: none',
    '- `HIGH` skill `add-endpoint`: Add an HTTP endpoint the way this repo does it',
    '- `LOW` hook `no-generated-edits`: Block edits under gen/',
  ].join('\n'))
})

test('an unavailable agentType is reported as degraded while the workflow completes', async () => {
  const { result, calls, logs } = await run('review-panel', { base: 'main' }, [['review:', { findings: [] }]], ['laa:security-reviewer'])
  assert.deepEqual(result.degraded, ['laa:security-reviewer'])
  assert.equal(result.report, [
    '**✓ No findings** · 0 refuted · correctness, completeness, security, performance',
    '',
    '**▲ Degraded** · laa:security-reviewer unavailable; generic agents stood in',
  ].join('\n'))
  const fallback = calls.find(c => c.opts.label === 'review:security' && !c.opts.agentType)
  assert.ok(fallback.prompt.startsWith('Act as the security-reviewer specialist'))
  assert.ok(logs.some(m => m.includes('laa:security-reviewer unavailable')))
})

test('degraded lists each agentType once, even after several fallbacks', async () => {
  const { result } = await run('investigate', { bug: 'b', angles: ['a1', 'a2', 'a3'] }, [['investigate:', { hypotheses: [] }]], ['laa:investigator'])
  assert.deepEqual(result.degraded, ['laa:investigator'])
  assert.match(result.report, /\*\*▲ Degraded\*\* · laa:investigator unavailable/)
})

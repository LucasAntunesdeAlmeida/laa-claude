// Checks the engine card's phase table against the workflows it draws: each engine's phases are its
// workflow's `meta.phases`, and every agent label a workflow writes resolves to the phase it runs in by the
// rule the card uses (the label's lowercase prefix names the phase, or has an alias). A workflow that gains
// a phase, or labels an agent the rule can't place, fails here until hooks/tables.ts follows.
// Run with `node --test "plugins/laa-mods/tests/drift/*.test.mjs"` (Node 22.18 or later).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ENGINES } from '../../hooks/git.ts'
import { phaseOf, PHASES, roleOf } from '../../hooks/tables.ts'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'laa', 'workflows')

const source = name => fs.readFileSync(path.join(DIR, `${name}.js`), 'utf8')

// meta is a pure literal, so it evaluates on its own.
const metaOf = name => new Function(`return ${source(name).match(/^export const meta = (\{[\s\S]*?\n\})/m)[1]}`)()

// The agent() options a workflow writes on one line: `{ label: 'cluster', phase: 'Cluster', … }`. The label is
// a string or a template; one that opens with a substitution (`${s.key}`) has no fixed role and is left out.
const agentsOf = name =>
  [...source(name).matchAll(/\{ label: (['`])([^'`]*)\1, phase: '([^']+)'/g)]
    .map(m => ({ label: m[2], phase: m[3] }))
    .filter(a => !a.label.startsWith('${'))

test('the phase table covers exactly the engines, and the workflow files', () => {
  assert.deepEqual(Object.keys(PHASES).sort(), [...ENGINES].sort())
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  assert.deepEqual(files.sort(), [...ENGINES].sort())
})

for (const engine of ENGINES) {
  test(`${engine}: the phases are the workflow's own`, () => {
    const meta = metaOf(engine)
    assert.equal(meta.name, engine)
    assert.deepEqual(PHASES[engine], meta.phases.map(p => p.title))
  })

  test(`${engine}: every agent label names the phase it runs in`, () => {
    const agents = agentsOf(engine)
    assert.ok(agents.length > 0, `${engine}.js has no one-line agent options with a fixed label`)
    for (const { label, phase } of agents) {
      assert.ok(PHASES[engine].includes(phase), `${engine}: phase '${phase}' of '${label}' is not in meta.phases`)
      assert.equal(phaseOf(engine, roleOf(label)), phase, `${engine}: label '${label}'`)
    }
  })
}

test('a label with no known role belongs to no phase', () => {
  assert.equal(roleOf('verify:2:logic'), 'verify')
  assert.equal(roleOf('Unlabelled agent'), '')
  assert.equal(phaseOf('investigate', 'architect'), null)
  assert.equal(phaseOf('design-panel', 'architect'), 'Propose')
  assert.equal(phaseOf('no-such-engine', 'verify'), null)
})

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

// The keys of the `specialists` array a workflow declares: what its `label: s.key` agents are labelled.
const specialistKeys = name => {
  const list = source(name).match(/^const specialists = \[([\s\S]*?)^\]/m)?.[1] ?? ''
  return [...list.matchAll(/\{ key: '([^']+)'/g)].map(m => m[1])
}

// Labels that are not written where the agent is started, by workflow and by the expression that stands for
// the label: the labels the expression gives, each of which must name the phase like any other. A workflow
// that labels an agent some other way fails here until it is listed, with samples.
const COMPUTED = {
  'design-panel': { 's.key': () => specialistKeys('design-panel') },
}

// The agent() options a workflow writes: `{ label: 'cluster', phase: 'Cluster', … }`, with the label as written.
const optionsOf = name =>
  [...source(name).matchAll(/\{ label: (.+?), phase: '([^']+)'/g)].map(m => ({ written: m[1], phase: m[2] }))

// The fixed start of a label written as a string or a template (`verify:${i + 1}` → `verify:`); null when
// it is written any other way, or opens with a substitution, so nothing of it can be read.
const fixedOf = written => {
  const m = /^(['`])((?:(?!\$\{)[^'`])+)/.exec(written)
  return m ? m[2] : null
}

// The labels an option's agents carry, as far as they can be read: the fixed start of a written one, the
// listed samples of a computed one. null when the label can't be read and is not listed.
const labelsOf = (name, written) => {
  const fixed = fixedOf(written)
  if (fixed !== null) return [fixed]
  const samples = COMPUTED[name]?.[written]
  return samples ? samples() : null
}

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
    const options = optionsOf(engine)
    assert.ok(options.length > 0, `${engine}.js has no agent options`)
    // Every agent's phase is read: one whose options are not `{ label: …, phase: '…'` on a line would be missed.
    assert.equal(options.length, (source(engine).match(/\bphase:/g) ?? []).length, `${engine}.js has agent options this test cannot read`)
    for (const { written, phase } of options) {
      assert.ok(PHASES[engine].includes(phase), `${engine}: phase '${phase}' of ${written} is not in meta.phases`)
      const labels = labelsOf(engine, written)
      assert.ok(labels, `${engine}: the label ${written} cannot be read; list it in COMPUTED with the labels it gives`)
      assert.ok(labels.length > 0, `${engine}: no sample labels for ${written}`)
      for (const label of labels) assert.equal(phaseOf(engine, roleOf(label)), phase, `${engine}: label '${label}' (${written})`)
    }
  })
}

test("the design panel's deep-dive specialists are the five the phase table places", () => {
  assert.deepEqual(specialistKeys('design-panel'), ['dataModel', 'api', 'threatModel', 'scaleRisks', 'infra'])
})

test('a label that cannot be read is refused unless it is listed', () => {
  assert.equal(fixedOf("'cluster'"), 'cluster')
  assert.equal(fixedOf('`verify:${i + 1}`'), 'verify:')
  assert.equal(fixedOf('`${s.key}`'), null)
  assert.equal(fixedOf('s.key'), null)
  assert.equal(labelsOf('investigate', 's.key'), null)
  assert.equal(labelsOf('design-panel', 'd.key'), null)
})

test('a label with no known role belongs to no phase', () => {
  assert.equal(roleOf('verify:2:logic'), 'verify')
  assert.equal(roleOf('Unlabelled agent'), '')
  assert.equal(phaseOf('investigate', 'architect'), null)
  assert.equal(phaseOf('design-panel', 'architect'), 'Propose')
  assert.equal(phaseOf('design-panel', roleOf('threatModel')), 'Deep-dive')
  assert.equal(phaseOf('review-panel', 'api'), null)
  assert.equal(phaseOf('no-such-engine', 'verify'), null)
})

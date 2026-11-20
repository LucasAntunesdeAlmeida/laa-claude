// Checks the stepper's step table against the skills it draws: every tracked skill's numbered headings, in
// order, are the table's steps. A skill that gains, loses, or renames a step fails here until hooks/tables.ts
// follows. Run with `node --test "plugins/laa-mods/tests/drift/*.test.mjs"` (Node 22.18 or later, which loads
// the .ts tables as they are).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { TRACKED } from '../../hooks/git.ts'
import { lastOf, STEPS, tableFor } from '../../hooks/tables.ts'

const SKILLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'laa', 'skills')

// A step's heading: `## 3. Investigate (fan-out)` in most skills, `## Phase 3: Plan` in /laa:build.
const HEADING = { build: /^## Phase (\d+): (.+?)\s*$/gm }
const NUMBERED = /^## (\d+)\. (.+?)\s*$/gm

// A heading's title as the skill prints it in its step line: without a trailing ` (…)`.
const titleOf = heading => heading.replace(/\s+\([^()]*\)$/, '')

const headingsOf = skill => {
  const text = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8')
  return [...text.matchAll(HEADING[skill] ?? NUMBERED)].map(m => ({ n: Number(m[1]), title: titleOf(m[2]) }))
}

test('the step table covers exactly the tracked skills', () => {
  assert.deepEqual(Object.keys(STEPS).sort(), [...TRACKED].sort())
})

for (const skill of TRACKED) {
  test(`${skill}: the table's steps are the skill's headings, in order`, () => {
    const table = STEPS[skill]
    const headings = headingsOf(skill)
    assert.ok(headings.length > 0, `${skill}/SKILL.md has no numbered headings`)
    assert.deepEqual(headings.map(h => h.n), headings.map((_, i) => table.first + i), 'the numbers run on from the first step')
    assert.deepEqual(table.steps.map(s => s.title), headings.map(h => h.title))
    assert.equal(lastOf(table), headings.at(-1).n)
  })

  test(`${skill}: labels are short, lowercase, and unique`, () => {
    const labels = STEPS[skill].steps.map(s => s.label)
    for (const label of labels) assert.match(label, /^[a-z-]{1,11}$/)
    assert.equal(new Set(labels).size, labels.length)
  })
}

test('a run is drawn from its own skill, and a resumed one from the skill whose steps it prints', () => {
  assert.equal(tableFor('fix', null), STEPS.fix)
  assert.equal(tableFor('fix', { n: 3, last: 7, title: 'Investigate' }), STEPS.fix)
  // /laa:resume has three steps of its own, then prints the steps of the pipeline it picked up.
  assert.equal(tableFor('resume', { n: 2, last: 3, title: 'Rebuild the context' }), STEPS.resume)
  assert.equal(tableFor('resume', { n: 5, last: 8, title: 'plan slices' }), STEPS.feature)
  assert.equal(tableFor('resume', { n: 4, last: 7, title: 'Decide' }), STEPS.fix)
  assert.equal(tableFor('resume', { n: 4, last: 7, title: 'Transform' }), STEPS.migrate)
  assert.equal(tableFor('resume', { n: 4, last: 9, title: 'Decide' }), null)
  assert.equal(tableFor('resume', { n: 4, last: 7, title: 'Something else' }), null)
  assert.equal(tableFor('explore', null), null)
})

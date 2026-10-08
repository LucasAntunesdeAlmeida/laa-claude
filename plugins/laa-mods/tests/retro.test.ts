import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { laaSkillOf } from '../hooks/git'
import { bash, fakeRepo } from './fake'

// The engine side of the nudge: skills expand as written, and suggestions are shown and recorded.
function world(on: On) {
  fakeRepo(on, { branch: 'fix/null-address' })
  const clock = mock.clock(on)
  const suggested: string[] = []
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('prompt.suggest', ($, e) => {
    suggested.push(e.text)
    return { isShown: true }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { clock, suggested }
}

const skill = (name: string) => ({ skill: `laa:${name}`, text: `# /laa:${name}\n\nBug: something\n` })

const turnEnd = (extra: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'Fixed on fix/null-address. Want me to open a PR?',
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  ...extra,
})

describe('laa skill detection', () => {
  test('reads the skill from the heading every laa skill starts with', () => {
    expect(laaSkillOf('# /laa:fix\n\nBug: x')).toBe('fix')
    expect(laaSkillOf('# /laa:retro\n')).toBe('retro')
    expect(laaSkillOf('# Commit helper\n')).toBeNull()
  })
})

describe('/laa:retro nudge', () => {
  test('suggests the retro once, after a pipeline that committed', async ($, on) => {
    const w = world(on)
    await $.skill.prompt(skill('fix'))
    await $.tool.call(bash('git commit -m "fix(invoices): handle missing address"'))
    await $.turn.complete(turnEnd())
    await w.clock.advance(500)
    expect(w.suggested).toEqual(['/laa:retro'])

    await $.turn.complete(turnEnd())
    await w.clock.advance(500)
    expect(w.suggested).toEqual(['/laa:retro'])
  })

  test('stays quiet at a gate before anything was committed', async ($, on) => {
    const w = world(on)
    await $.skill.prompt(skill('feature'))
    await $.turn.complete(turnEnd())
    await w.clock.advance(500)
    expect(w.suggested).toEqual([])
  })

  test('stays quiet once the retro ran, and for subagent or interrupted turns', async ($, on) => {
    const w = world(on)
    await $.skill.prompt(skill('migrate'))
    await $.tool.call(bash('git commit -m "refactor: swap logger"'))
    await $.turn.complete(turnEnd({ agentId: 'agent-1' }))
    await $.turn.complete(turnEnd({ isAborted: true }))
    await w.clock.advance(500)
    expect(w.suggested).toEqual([])

    await $.skill.prompt(skill('retro'))
    await $.turn.complete(turnEnd())
    await w.clock.advance(500)
    expect(w.suggested).toEqual([])
  })

  test("replaces the engine's own guess with the retro while the nudge is due", async ($, on) => {
    const w = world(on)
    await $.skill.prompt(skill('fix'))
    await $.tool.call(bash('git commit -m "fix: x"'))
    await $.prompt.suggest({ text: 'run the tests', origin: { kind: 'suggestion' } })
    expect(w.suggested).toEqual(['/laa:retro'])
    await $.prompt.suggest({ text: 'run the tests', origin: { kind: 'suggestion' } })
    expect(w.suggested).toEqual(['/laa:retro', 'run the tests'])
  })
})

const closing = 'Found 3 findings; 2 were refuted.\n\n**Next**\n- `/laa:review --fix`: apply the HIGH fixes\n- say "open the PR"'

describe('next-step suggestion', () => {
  test("offers the first laa command of a closing report's Next list, once", async ($, on) => {
    const w = world(on)
    await $.turn.complete({ ...turnEnd(), answer: closing })
    await w.clock.advance(500)
    expect(w.suggested).toEqual(['/laa:review --fix'])
    await $.prompt.suggest({ text: 'run the tests', origin: { kind: 'suggestion' } })
    expect(w.suggested).toEqual(['/laa:review --fix', 'run the tests'])
  })

  test("replaces the engine's own guess with the Next command before its own nudge", async ($, on) => {
    const w = world(on)
    await $.turn.complete({ ...turnEnd(), answer: closing })
    await $.prompt.suggest({ text: 'run the tests', origin: { kind: 'suggestion' } })
    await w.clock.advance(500)
    expect(w.suggested).toEqual(['/laa:review --fix'])
  })

  test('lets the retro nudge win while it is due', async ($, on) => {
    const w = world(on)
    await $.skill.prompt(skill('fix'))
    await $.tool.call(bash('git commit -m "fix: x"'))
    await $.turn.complete({ ...turnEnd(), answer: closing })
    await w.clock.advance(500)
    expect(w.suggested).toEqual(['/laa:retro'])
  })

  test('offers nothing for a reply without a laa command in its Next list', async ($, on) => {
    const w = world(on)
    await $.turn.complete({ ...turnEnd(), answer: 'Done.\n\n**Next**\n- say "open the PR"' })
    await w.clock.advance(500)
    expect(w.suggested).toEqual([])
  })
})

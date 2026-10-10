import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { closingOf, isLaaClosing } from '../hooks/report'
import { ALL_SURFACES, allowMainRun, bash, fakeRepo, golden, reply, show, skill, turnEnd } from './fake'
import type { Fake } from './fake'

// The closing report's card: which block of a reply is one, whose it is, and the frame it is drawn in on
// every surface. Every report here is invented.

const MINIMAL = { options: { visuals: 'minimal' } }
const ENGINE_OWN = '<Box key="engine" />'

// A block of the model's reply as the transcript hands it to a render hook.
const block = (text: string, extra: { isSummary?: true } = {}) => ({
  plugin: 'laa-mods',
  component: 'AssistantMessage' as const,
  props: { text, isFirstOfReply: true, ...extra },
})

// A repo on a task branch with the engine's own drawing of every row beneath the plugin, and one git command
// so the plugin reads the repo. Returns the props the last draw of each site handed the engine, absent while
// the plugin drew the site itself.
async function world($: Engine, on: On, f: Fake = {}) {
  fakeRepo(on, { branch: 'fix/invoice-500', mapAge: 1, ...f })
  const handed: Record<string, Record<string, unknown> | undefined> = {}
  on('ui.render', ($, e) => {
    handed[e.component] = { ...e.props }
    return $.ui.resolve(e).Box({ key: 'engine' })
  })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  await $.tool.call(bash('git status'))
  return handed
}

// A laa run that ends with `text`: the skill starts, the reply is stored, the turn ends.
async function runClosing($: Engine, text: string, uuid = 'row-1') {
  await $.skill.prompt(skill('fix'))
  await $.session.append(reply(text, uuid))
  await $.turn.complete(turnEnd(text))
}

// The block as each of the four surfaces draws it, which must be one tree.
async function drawnOnAll($: Engine, text: string) {
  const trees: string[] = []
  for (const surface of ALL_SURFACES) {
    const ui = await $.ui.mount({ ...block(text), surface })
    trees.push(show(await ui.drawn()))
    await ui.unmount()
  }
  expect(new Set(trees).size, 'one tree on every surface').toBe(1)
  return trees[0] ?? ''
}

// The tone of a drawn card: its frame's border and its status line, which are one item and so one color.
async function toneOf($: Engine, text: string) {
  const ui = await $.ui.mount({ ...block(text), surface: 'terminal' })
  const tree = show(await ui.drawn())
  await ui.unmount()
  const colors = [...tree.matchAll(/(?:borderColor|color)="([a-z]+)"/g)].map(m => m[1])
  expect(colors, tree).toHaveLength(2)
  expect(colors[0]).toBe(colors[1])
  return colors[0]
}

const FIXED = [
  '**✓ Fixed** · nil address',
  '',
  '- **Branch** fix/invoice-500 · 2 commits · not pushed',
  '- **Changed** 3 files',
  '- **Tests** `go test ./billing/...` ✓',
  '',
  '**Next**',
  '- `/laa:review`: check the branch before the PR',
  '- say "open the PR": drafts it with the git conventions',
].join('\n')

// A report with nothing in its Next list that names laa: only a tracked run makes it laa's.
const PLAIN_NEXT = '**✓ Fixed** · nil address\n- **Changed** 3 files\n\n**Next**\n- say "open the PR": drafts it'

const FAILED = [
  'The fix did not hold.',
  '',
  '**✗ Tests still fail** · billing/export',
  '- **Tried** guarding the nil address; pinning the locale',
  '- **Cause** the fixture ships no address at all',
  '',
  '**Next**',
  '- say "fix the fixture": adds the address and runs the tests again',
].join('\n')

const DEGRADED = `**▲ Agent mode** · the workflow tool was not there\n\n${FIXED}`

describe('closingOf', () => {
  const FIXTURES: Record<string, string> = {
    'no text above the status line': FIXED,
    'text above the status line': `Done.\n\n${FIXED}`,
    'a trailing newline': `${FIXED}\n`,
    'a degraded line above the status line': DEGRADED,
    'a failed report with Tried and Cause': FAILED,
    'one empty line above the status line': `\n${FIXED}`,
    'two empty lines above the status line': `\n\n${FIXED}`,
    'a workflow report above the closing one': `**✓ 2 of 3 root causes survived** · 5 angles\n- ✓ \`a.go:1\` nil address\n\n${FIXED}`,
    'a numbered Next list with a continued item': '**✓ Migrated** · 12 sites\n**Next**\n\n1. `/laa:review`: check it\n   before the PR\n2. say "push"\n',
  }

  for (const [name, text] of Object.entries(FIXTURES)) {
    test(`its parts join back to the block: ${name}`, () => {
      const c = closingOf(text)
      if (!c) throw new Error('not read as a closing report')
      expect(c.pre === null ? `${c.statusRaw}\n${c.rest}` : `${c.pre}\n${c.statusRaw}\n${c.rest}`).toBe(text)
      expect(text.endsWith(c.next)).toBe(true)
    })
  }

  test('cuts the block at its last status line and keeps the blank line under it', () => {
    expect(closingOf(`Done.\n\n${FIXED}`)).toEqual({
      pre: 'Done.\n',
      statusRaw: '**✓ Fixed** · nil address',
      status: '✓ Fixed · nil address',
      key: expect.stringMatching(/^\*\*✓ Fixed\*\* · nil address #[0-9a-z]{1,7}$/),
      ok: true,
      rest: FIXED.split('\n').slice(1).join('\n'),
      next: '- `/laa:review`: check the branch before the PR\n- say "open the PR": drafts it with the git conventions',
    })
    expect(closingOf(FIXED)?.rest.startsWith('\n- **Branch**')).toBe(true)
    expect(closingOf(FAILED)).toMatchObject({ pre: 'The fix did not hold.\n', status: '✗ Tests still fail · billing/export', ok: false })
    expect(closingOf(DEGRADED)).toMatchObject({ pre: '**▲ Agent mode** · the workflow tool was not there\n', statusRaw: '**✓ Fixed** · nil address' })
  })

  test('reads nothing else as a closing report', () => {
    const NOT: Record<string, string> = {
      'a workflow report, which has no Next': '**✓ 2 of 3 root causes survived** · 5 angles\n- ✓ `a.go:1` nil address',
      'a step in the middle of a run': '**▸ 3/7 · Investigate** · 5 angles',
      'a Next above the status line': '**Next**\n- `/laa:retro`\n\n**✓ Fixed** · nil address',
      'a Next with no list': '**✓ Fixed** · nil address\n\n**Next**\n',
      'a Next followed by prose': '**✓ Fixed** · nil address\n\n**Next**\nRun the review.',
      'text after the list': `${FIXED}\n\nTell me if you want the PR.`,
      'a degraded line alone': '**▲ Agent mode** · weaker\n\n**Next**\n- `/laa:retro`',
      'CRLF line ends': FIXED.replace(/\n/g, '\r\n'),
    }
    for (const [name, text] of Object.entries(NOT)) expect(closingOf(text), name).toBeNull()
  })

  test('tells no line above the status line from one empty line above it', () => {
    expect(closingOf(FIXED)?.pre).toBeNull()
    expect(closingOf(`\n${FIXED}`)?.pre).toBe('')
    expect(closingOf(`\n\n${FIXED}`)?.pre).toBe('\n')
  })

  test('draws the status line as plain text: inline code without its backticks, a link as its label', () => {
    const under = '\n- **Cause** a retried webhook\n\n**Next**\n- say "retry"'
    const coded = closingOf(`**✗ Tests still fail** · \`internal/orders/cancel.go:42\` and \`list.go:77\`${under}`)
    expect(coded?.status).toBe('✗ Tests still fail · internal/orders/cancel.go:42 and list.go:77')
    expect(coded?.statusRaw).toBe('**✗ Tests still fail** · `internal/orders/cancel.go:42` and `list.go:77`')
    const linked = closingOf(`**✓ Opened the PR** · [orders#12](https://example.com/orders/pull/12) is ready${under}`)
    expect(linked?.status).toBe('✓ Opened the PR · orders#12 is ready')
    expect(linked?.statusRaw).toBe('**✓ Opened the PR** · [orders#12](https://example.com/orders/pull/12) is ready')
  })

  test('keys a report by its status line and what stands under it, not by what stands above', () => {
    const a = closingOf('**✗ Tests still fail** · api\n- **Cause** a missing import\n\n**Next**\n- say "retry"')
    const b = closingOf('**✗ Tests still fail** · api\n- **Cause** a stale cache\n\n**Next**\n- say "retry"')
    const above = closingOf('Second try.\n\n**✗ Tests still fail** · api\n- **Cause** a missing import\n\n**Next**\n- say "retry"')
    expect(a?.key).not.toBe(b?.key)
    expect(above?.key).toBe(a?.key)
    expect(a?.key.startsWith('**✗ Tests still fail** · api #')).toBe(true)
  })
})

describe('isLaaClosing', () => {
  const closing = (text: string) => {
    const c = closingOf(text)
    if (!c) throw new Error('not read as a closing report')
    return c
  }

  test("a report is laa's when its status line was recorded, or its Next list names a laa command in backticks", () => {
    const plain = closing(PLAIN_NEXT)
    expect(isLaaClosing(plain, [])).toBe(false)
    expect(isLaaClosing(plain, ['**✓ Shipped** · other #1', plain.key])).toBe(true)
    // The same status line over another body is another report.
    expect(isLaaClosing(plain, [plain.statusRaw, closing(`${PLAIN_NEXT} now`).key])).toBe(false)
    expect(isLaaClosing(closing(FIXED), [])).toBe(true)
    expect(isLaaClosing({ ...plain, next: '- `/laa-findings`: work through them' }, [])).toBe(true)
    expect(isLaaClosing({ ...plain, next: '- `/laa:review main..HEAD`: check it' }, [])).toBe(true)
  })

  test('a laa command outside backticks, outside the Next list, or of another plugin does not count', () => {
    const plain = closing(PLAIN_NEXT)
    expect(isLaaClosing({ ...plain, next: '- run /laa:retro next' }, [])).toBe(false)
    expect(isLaaClosing(closing('**✓ Fixed** · x\n- see `/laa:retro`\n\n**Next**\n- say "push"'), [])).toBe(false)
    expect(isLaaClosing({ ...plain, next: '- `/deploy:ship`: release it' }, [])).toBe(false)
  })
})

describe('report card', () => {
  test('frames a tracked closing report on every surface, in the success color', async ($, on) => {
    await world($, on)
    await runClosing($, PLAIN_NEXT)
    expect(await drawnOnAll($, PLAIN_NEXT)).toBe(golden(`
      <Box flexDirection="column" key="laa-report">
        <Box borderColor="success" borderStyle="round" flexDirection="column" key="frame" paddingX=1>
          <Text bold color="success">"✓ Fixed · nil address"</Text>
          <Markdown key="rest" text="- **Changed** 3 files\\n\\n**Next**\\n- say \\"open the PR\\": drafts it" />
        </Box>
      </Box>
    `))
  })

  test('draws what stands above the status line first, outside the frame', async ($, on) => {
    await world($, on)
    await runClosing($, FAILED)
    expect(await drawnOnAll($, FAILED)).toBe(golden(`
      <Box flexDirection="column" key="laa-report">
        <Markdown key="pre" text="The fix did not hold.\\n" />
        <Box borderColor="error" borderStyle="round" flexDirection="column" key="frame" paddingX=1>
          <Text bold color="error">"✗ Tests still fail · billing/export"</Text>
          <Markdown key="rest" text="- **Tried** guarding the nil address; pinning the locale\\n- **Cause** the fixture ships no address at all\\n\\n**Next**\\n- say \\"fix the fixture\\": adds the address and runs the tests again" />
        </Box>
      </Box>
    `))
  })

  test('keeps the degraded line above the frame and the blank line under the status line inside it', async ($, on) => {
    await world($, on)
    const ui = await $.ui.mount({ ...block(DEGRADED), surface: 'terminal' })
    const tree = show(await ui.drawn())
    expect(tree).toContain(`<Markdown key="pre" text=${JSON.stringify('**▲ Agent mode** · the workflow tool was not there\n')} />`)
    expect(tree).toContain(`<Markdown key="rest" text=${JSON.stringify(FIXED.split('\n').slice(1).join('\n'))} />`)
    await ui.unmount()
  })

  test('frames a closing report after a resume, when nothing is recorded and its Next names a laa command', async ($, on) => {
    const handed = await world($, on)
    const resumed = '**✓ Resumed and finished** · 2 slices\n- **Changed** 5 files\n\n**Next**\n- `/laa:retro`: capture what we learned'
    const tree = await drawnOnAll($, resumed)
    expect(tree).toContain('<Text bold color="success">"✓ Resumed and finished · 2 slices"</Text>')
    expect(tree).toContain('<Box borderColor="success" borderStyle="round" flexDirection="column" key="frame" paddingX=1>')
    expect(handed.AssistantMessage).toBeUndefined()
  })

  test('draws no escape sequence or control character the model wrote', async ($, on) => {
    await world($, on)
    const text = 'up\u001b[31m top\u0007\n**✓ Fixed** ·\ta\u001b[2Jb\n- x\u0000y\n\n**Next**\n- `/laa:retro`'
    const tree = await drawnOnAll($, text)
    expect(tree).toContain('<Markdown key="pre" text="up top" />')
    expect(tree).toContain('"✓ Fixed · ab"')
    expect(tree).toContain(`<Markdown key="rest" text=${JSON.stringify('- xy\n\n**Next**\n- `/laa:retro`')} />`)
  })

  test("leaves every other block to the engine's own drawing", async ($, on) => {
    const handed = await world($, on)
    await $.skill.prompt(skill('fix'))
    const OTHERS: Record<string, string> = {
      'a workflow report without Next': '**✓ 2 of 3 root causes survived** · 5 angles\n- ✓ `a.go:1` nil address',
      'a step in the middle of a run': '**▸ 3/7 · Investigate** · 5 angles',
      "a reply that is not laa's": '**✓ Deployed** · staging\n\n**Next**\n- run the smoke tests\n- `/deploy:promote`: ship it',
      'a block with text after the Next list': `${FIXED}\n\nTell me if you want the PR.`,
    }
    for (const [name, text] of Object.entries(OTHERS)) {
      for (const surface of ALL_SURFACES) {
        handed.AssistantMessage = undefined
        const ui = await $.ui.mount({ ...block(text), surface })
        expect(show(await ui.drawn()), `${name} · ${surface}`).toBe(ENGINE_OWN)
        expect(handed.AssistantMessage, name).toEqual({ text, isFirstOfReply: true })
        await ui.unmount()
      }
    }
  })

  test('leaves a summary block alone, even of a tracked closing report', async ($, on) => {
    const handed = await world($, on)
    await runClosing($, FIXED)
    for (const surface of ALL_SURFACES) {
      handed.AssistantMessage = undefined
      const ui = await $.ui.mount({ ...block(FIXED, { isSummary: true }), surface })
      expect(show(await ui.drawn()), surface).toBe(ENGINE_OWN)
      expect(handed.AssistantMessage).toEqual({ text: FIXED, isFirstOfReply: true, isSummary: true })
      await ui.unmount()
    }
  })

  test('frames a tracked report whose block opens with one empty line', async ($, on) => {
    await world($, on)
    const text = `\n${PLAIN_NEXT}`
    await runClosing($, text)
    const tree = await drawnOnAll($, text)
    expect(tree).toContain('<Box borderColor="success" borderStyle="round" flexDirection="column" key="frame" paddingX=1>')
    expect(tree).not.toContain('key="pre"')
  })

  test('draws no markdown above the frame when only spaces stand above the status line', async ($, on) => {
    await world($, on)
    const tree = await drawnOnAll($, `  \n\t\n${FIXED}`)
    expect(tree).toContain('key="frame"')
    expect(tree).not.toContain('key="pre"')
  })

  test('draws the status line without the backticks or the link target the model wrote in it', async ($, on) => {
    await world($, on)
    const under = '\n- **Cause** a retried webhook\n\n**Next**\n- `/laa:fix the retry`: try again'
    expect(await drawnOnAll($, `**✗ Tests still fail** · \`internal/orders/cancel.go:42\`${under}`))
      .toContain('<Text bold color="warning">"✗ Tests still fail · internal/orders/cancel.go:42"</Text>')
    expect(await drawnOnAll($, `**✓ Opened the PR** · [orders#12](https://example.com/orders/pull/12)${under}`))
      .toContain('<Text bold color="success">"✓ Opened the PR · orders#12"</Text>')
  })

  test("leaves a report too long for one drawing to the engine's own", async ($, on) => {
    const handed = await world($, on)
    const text = `**✓ Fixed** · nil address\n- **Log** ${'x'.repeat(100001)}\n\n**Next**\n- \`/laa:retro\`: capture what we learned`
    for (const surface of ALL_SURFACES) {
      handed.AssistantMessage = undefined
      const ui = await $.ui.mount({ ...block(text), surface })
      expect(show(await ui.drawn()), surface).toBe(ENGINE_OWN)
      expect(handed.AssistantMessage).toEqual({ text, isFirstOfReply: true })
      await ui.unmount()
    }
  })

  test('frames nothing under visuals: minimal', MINIMAL, async ($, on) => {
    const handed = await world($, on)
    await runClosing($, FIXED)
    for (const surface of ALL_SURFACES) {
      handed.AssistantMessage = undefined
      const ui = await $.ui.mount({ ...block(FIXED), surface })
      expect(show(await ui.drawn()), surface).toBe(ENGINE_OWN)
      expect(handed.AssistantMessage).toEqual({ text: FIXED, isFirstOfReply: true })
      await ui.unmount()
    }
  })
})

describe('one red item', () => {
  const OLDER = '**✗ Build broke** · api\n- **Cause** a missing import\n\n**Next**\n- say "retry"'

  test('a failed report is red only while it is the newest recorded one', async ($, on) => {
    await world($, on)
    await runClosing($, OLDER)
    expect(await toneOf($, OLDER)).toBe('error')

    await runClosing($, FAILED, 'row-2')
    expect(await toneOf($, FAILED)).toBe('error')
    expect(await toneOf($, OLDER)).toBe('warning')

    await runClosing($, PLAIN_NEXT, 'row-3')
    expect(await toneOf($, FAILED)).toBe('warning')
    expect(await toneOf($, PLAIN_NEXT)).toBe('success')
  })

  // Two reports the same to the letter (status line and body) share a key, so both would draw red: accepted.
  test('of two runs that failed with the same status line, only the newest is red', async ($, on) => {
    await world($, on)
    const first = '**✗ Tests still fail** · api\n- **Cause** a missing import\n\n**Next**\n- say "retry"'
    const second = '**✗ Tests still fail** · api\n- **Cause** a stale cache\n\n**Next**\n- say "retry"'
    await runClosing($, first)
    await runClosing($, second, 'row-2')
    expect(await toneOf($, first)).toBe('warning')
    expect(await toneOf($, second)).toBe('error')
  })

  test('the same holds with a run that succeeded between them', async ($, on) => {
    await world($, on)
    const first = '**✗ Tests still fail** · api\n- **Cause** a missing import\n\n**Next**\n- say "retry"'
    const third = '**✗ Tests still fail** · api\n- **Cause** a stale cache\n\n**Next**\n- say "retry"'
    await runClosing($, first)
    await runClosing($, PLAIN_NEXT, 'row-2')
    expect(await toneOf($, first)).toBe('warning')
    await runClosing($, third, 'row-3')
    expect(await toneOf($, first)).toBe('warning')
    expect(await toneOf($, third)).toBe('error')
    expect(await toneOf($, PLAIN_NEXT)).toBe('success')
  })

  test('a failed report nobody recorded is never red', async ($, on) => {
    await world($, on)
    const resumed = '**✗ Tests still fail** · billing/export\n- **Cause** no address\n\n**Next**\n- `/laa:fix the fixture`: try again'
    expect(await toneOf($, resumed)).toBe('warning')
    // Recorded, it is the newest; after /clear the record is gone, and the red with it.
    await runClosing($, resumed)
    expect(await toneOf($, resumed)).toBe('error')
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} as never })
    expect(await toneOf($, resumed)).toBe('warning')
  })

  test("the band's blocked default branch takes the red, and gives it back once edits are allowed", async ($, on) => {
    await world($, on, { branch: 'main' })
    await runClosing($, FAILED)
    const ui = await $.ui.mount({ ...block(FAILED), surface: 'terminal' })
    expect(show(await ui.drawn())).toContain('borderColor="warning"')
    expect(show(await ui.drawn())).not.toContain('"error"')
    // The mounted card follows the change with no redraw asked for: it read the state it is colored from.
    await $.command.run(allowMainRun)
    expect(show(await ui.drawn())).toContain('borderColor="error"')
    expect(show(await ui.drawn())).toContain('<Text bold color="error">')
    await ui.unmount()
  })
})

describe('a block drawn before its row is stored', () => {
  test('gains the frame once the run closes with it, with no redraw asked for', async ($, on) => {
    const handed = await world($, on)
    for (const surface of ALL_SURFACES) {
      await $.skill.prompt(skill('fix'))
      const text = `**✓ Fixed on ${surface}** · nil address\n- **Changed** 3 files\n\n**Next**\n- say "open the PR": drafts it`
      const ui = await $.ui.mount({ ...block(text), surface })
      expect(show(await ui.drawn()), surface).toBe(ENGINE_OWN)
      expect(handed.AssistantMessage).toEqual({ text, isFirstOfReply: true })

      await $.session.append(reply(text, `row-${surface}`))
      const tree = show(await ui.drawn())
      expect(tree, surface).toContain('<Box borderColor="success" borderStyle="round" flexDirection="column" key="frame" paddingX=1>')
      expect(tree, surface).toContain(`<Text bold color="success">"✓ Fixed on ${surface} · nil address"</Text>`)
      await ui.unmount()
    }
  })

  test('is not drawn again when it read no state: a later closing leaves a mid-run block alone', async ($, on) => {
    const handed = await world($, on)
    await $.skill.prompt(skill('fix'))
    const ui = await $.ui.mount({ ...block('**▸ 3/7 · Investigate** · 5 angles'), surface: 'terminal' })
    handed.AssistantMessage = undefined
    await $.session.append(reply(PLAIN_NEXT))
    expect(show(await ui.drawn())).toBe(ENGINE_OWN)
    expect(handed.AssistantMessage).toBeUndefined()
    await ui.unmount()
  })
})

import { describe, expect, test } from 'claude-code/testing'

import { allowMainRun, bash, denied, edit, fakeRepo, ROOT } from './fake'

describe('default-branch guard', () => {
  test('blocks an edit on main in an adopted repo', async ($, on) => {
    fakeRepo(on)
    const res = await $.tool.call(edit(`${ROOT}/src/a.go`))
    expect(denied(res)).toBe(true)
    expect(String(res.deny)).toContain('default branch `main`')
    expect(String(res.deny)).toContain('/laa-allow-main')
  })

  test('lets an edit through on a task branch', async ($, on) => {
    fakeRepo(on, { branch: 'feat/export' })
    const res = await $.tool.call(edit(`${ROOT}/src/a.go`))
    expect(denied(res)).toBe(false)
  })

  test('uses origin/HEAD as the default branch when there is one', async ($, on) => {
    fakeRepo(on, { branch: 'main', origin: 'origin/develop' })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
  })

  test('lets the first commit of a new repo through', async ($, on) => {
    fakeRepo(on, { hasCommits: false })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
    expect(denied(await $.tool.call(bash('git commit -m "chore: initial commit"')))).toBe(false)
  })

  test('ignores repos laa has not adopted by default', async ($, on) => {
    fakeRepo(on, { isAdopted: false })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
  })

  test('guards every repo with guard: always', { options: { guard: 'always' } }, async ($, on) => {
    fakeRepo(on, { isAdopted: false })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(true)
  })

  test('does nothing with guard: off', { options: { guard: 'off' } }, async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
  })

  test('lets ignored files and files outside the repo through', async ($, on) => {
    fakeRepo(on, { ignored: [`${ROOT}/.claude/settings.local.json`] })
    expect(denied(await $.tool.call(edit(`${ROOT}/.claude/settings.local.json`)))).toBe(false)
    expect(denied(await $.tool.call(edit('C:/other/notes.md')))).toBe(false)
  })

  test("lets laa's local state through, even before its .gitignore exists", async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(edit(`${ROOT}/.claude/laa/local/.gitignore`)))).toBe(false)
    expect(denied(await $.tool.call(edit(`${ROOT}/.claude/laa/local/runs/main.md`)))).toBe(false)
    expect(denied(await $.tool.call(edit(`${ROOT}/.claude/laa/learnings.md`)))).toBe(true)
  })

  test("can't be walked out of with .. segments", async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(edit(`${ROOT}/.claude/laa/local/../../../src/a.go`)))).toBe(true)
    expect(denied(await $.tool.call(edit(`${ROOT}/.git/../src/a.go`)))).toBe(true)
    expect(denied(await $.tool.call(edit('.claude/laa/local/../../../src/a.go')))).toBe(true)
  })

  test('resolves relative paths against the session directory', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(edit('src/a.go')))).toBe(true)
  })

  test('blocks git commit on main, in any spelling, and nothing else', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash('git commit -m "fix: x"')))).toBe(true)
    expect(denied(await $.tool.call(bash('git add -A && git commit -q -F -')))).toBe(true)
    expect(denied(await $.tool.call(bash(`git -C ${ROOT} commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash('git status')))).toBe(false)
    expect(denied(await $.tool.call(bash('git switch -c fix/x')))).toBe(false)
    expect(denied(await $.tool.call(bash('echo "git commit"')))).toBe(false)
  })

  test('/laa-allow-main lifts the block for the session, and runs again to restore it', async ($, on) => {
    fakeRepo(on)
    const first = await $.command.run(allowMainRun)
    expect(String('text' in first ? first.text : '')).toContain('allowed')
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
    await $.command.run(allowMainRun)
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(true)
  })
})

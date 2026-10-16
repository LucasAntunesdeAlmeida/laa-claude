import { describe, expect, test } from 'claude-code/testing'

import { allowMainRun, bash, denied, edit, fakeRepo, notebook, powershell, ROOT, write } from './fake'

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

  test('blocks a NotebookEdit on main', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(notebook(`${ROOT}/src/explore.ipynb`)))).toBe(true)
  })

  test('takes the directory a commit runs in from the cd before it', async ($, on) => {
    fakeRepo(on, { cwd: 'C:/other' })
    expect(denied(await $.tool.call(bash(`cd ${ROOT} && git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`cd ${ROOT}/src && git add . && git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`(cd "${ROOT}" && git commit -m x)`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`cd ${ROOT} && cd src && git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`cd ${ROOT} && git -C src commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
    expect(denied(await $.tool.call(bash(`git commit -m x; cd ${ROOT}`)))).toBe(false)
  })

  test('maps Git Bash /c/ paths to the drive, in a cd, a -C, and a file path', async ($, on) => {
    fakeRepo(on, { cwd: 'C:/other' })
    expect(denied(await $.tool.call(bash('cd /c/r && git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(bash('git -C /c/r/src commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(edit('/c/r/src/a.go')))).toBe(true)
    expect(denied(await $.tool.call(bash('cd /c/other && git commit -m x')))).toBe(false)
  })

  test('reads Windows paths with backslashes', async ($, on) => {
    fakeRepo(on, { cwd: 'C:/other' })
    expect(denied(await $.tool.call(edit('C:\\r\\src\\a.go')))).toBe(true)
    expect(denied(await $.tool.call(write('c:\\r\\src\\b.go')))).toBe(true)
    expect(denied(await $.tool.call(edit('C:\\r\\.claude\\laa\\local\\runs\\main.md')))).toBe(false)
    expect(denied(await $.tool.call(bash('cd C:\\r && git commit -m x')))).toBe(true)
  })

  test('blocks a commit through the PowerShell tool, in its spellings', async ($, on) => {
    fakeRepo(on, { cwd: 'C:/other' })
    expect(denied(await $.tool.call(powershell(`Set-Location ${ROOT}; git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(powershell('Set-Location -Path "C:\\r\\src"; git add .; git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(powershell(`Push-Location ${ROOT}; git.exe commit -m x; Pop-Location`)))).toBe(true)
    expect(denied(await $.tool.call(powershell(`cd ${ROOT}; & git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(powershell(`git -C '${ROOT}' commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(powershell(`Set-Location ${ROOT}; git status`)))).toBe(false)
    expect(denied(await $.tool.call(powershell('git commit -m x')))).toBe(false)
  })

  test('lets edits and commits through in a worktree on a task branch', async ($, on) => {
    fakeRepo(on, { branch: 'feat/export', worktreeOf: 'C:/main' })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
  })

  test('starts no git process for an edit with guard: off', { options: { guard: 'off' } }, async ($, on) => {
    const seen = fakeRepo(on)
    await $.tool.call(edit(`${ROOT}/src/a.go`))
    await $.tool.call(write(`${ROOT}/src/b.go`))
    expect(seen.git).toEqual([])
  })

  test('checks no branch outside an adopted repo, and starts no git process after /laa-allow-main', async ($, on) => {
    const seen = fakeRepo(on, { isAdopted: false })
    // The guard's own git runs start in the edited file's folder; the band's refresh runs at the repo's root.
    const guardRuns = () => seen.git.filter(g => g.startsWith(`${ROOT}/src:`))
    await $.tool.call(edit(`${ROOT}/src/a.go`))
    expect(guardRuns()).toEqual([`${ROOT}/src: rev-parse --show-toplevel`])
    await $.command.run(allowMainRun)
    await $.tool.call(edit(`${ROOT}/src/a.go`))
    expect(guardRuns()).toHaveLength(1)
  })

  test('a link out of local state into the repo gets no exemption', async ($, on) => {
    fakeRepo(on, { links: { [`${ROOT}/.claude/laa/local/src`]: `${ROOT}/src` } })
    expect(denied(await $.tool.call(edit(`${ROOT}/.claude/laa/local/src/a.go`)))).toBe(true)
  })

  for (const failure of ['missing', 'timeout'] as const) {
    test(`treats git that is ${failure} as no repo: nothing to guard`, async ($, on) => {
      fakeRepo(on, { git: failure })
      expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
      expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
    })
  }

  test('fails closed: a guard that throws refuses the edit or commit it could not check', async ($, on) => {
    fakeRepo(on, { isFsDown: true })
    for (const call of [edit(`${ROOT}/src/a.go`), write(`${ROOT}/src/b.go`), notebook(`${ROOT}/n.ipynb`), bash('git commit -m x'), powershell('git commit -m x')]) {
      const res = await $.tool.call(call)
      expect(denied(res)).toBe(true)
      expect(String(res.deny)).toContain('guard failed')
    }
    // A Bash command that doesn't commit never reads the file system, so it runs.
    expect(denied(await $.tool.call(bash('ls')))).toBe(false)
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

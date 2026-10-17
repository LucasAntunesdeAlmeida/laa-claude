import { describe, expect, test } from 'claude-code/testing'

import { allowMainRun, bash, denied, edit, fakeRepo, notebook, powershell, POSIX_ROOT, ROOT, write } from './fake'

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

  test('treats a missing git as no repo: nothing to guard', async ($, on) => {
    fakeRepo(on, { git: 'missing' })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
  })

  for (const [name, fake] of [
    ['every git run times out', { git: 'timeout' }],
    ['only symbolic-ref times out', { rejects: 'symbolic-ref' }],
    ['only the HEAD check times out', { rejects: 'rev-parse -q --verify' }],
  ] as const) {
    test(`fails closed when git starts but ${name}`, async ($, on) => {
      fakeRepo(on, fake)
      for (const call of [edit(`${ROOT}/src/a.go`), bash('git commit -m x'), powershell('git commit -m x')]) {
        const res = await $.tool.call(call)
        expect(denied(res)).toBe(true)
        expect(String(res.deny)).toContain('guard failed')
      }
    })
  }

  test('a git that fails with an exit code is an answer: a detached HEAD is no default branch', async ($, on) => {
    fakeRepo(on, { branch: null })
    expect(denied(await $.tool.call(edit(`${ROOT}/src/a.go`)))).toBe(false)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
  })

  test('restores the directory a subshell, a block, or Pop-Location left', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash('(cd C:/other && make); git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(bash('{ cd C:/other; make; }; git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(powershell('Push-Location C:/other; make; Pop-Location; git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(bash('pushd C:/other && popd && git commit -m x')))).toBe(true)
    // Brackets inside quotes are text, not a subshell.
    expect(denied(await $.tool.call(bash('(cd C:/other && echo ")" && git commit -m x)')))).toBe(false)
  })

  test('popd goes back one level of the stack', async ($, on) => {
    fakeRepo(on, { cwd: 'C:/other' })
    expect(denied(await $.tool.call(bash(`pushd ${ROOT}; pushd C:/other; popd; git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`pushd C:/other; pushd ${ROOT}; popd; git commit -m x`)))).toBe(false)
  })

  test('checks where the commit was when a cd may have failed, or went back with cd -', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash('cd C:/nope || true; git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(bash('cd C:/other && cd - && git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(bash('cd - && git commit -m x')))).toBe(true)
  })

  test('lets the worktree flow through: cd into the worktree, then commit', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash('cd ../other && git commit -m x')))).toBe(false)
    expect(denied(await $.tool.call(powershell('Set-Location ../other; git commit -m x')))).toBe(false)
  })

  test('checks every commit in a command, each from its own directory', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash('git -C C:/other commit -m a; git commit -m b')))).toBe(true)
    expect(denied(await $.tool.call(bash('cd C:/other && git commit -m a && cd C:/r && git commit -m b')))).toBe(true)
    expect(denied(await $.tool.call(bash('git -C C:/other commit -m a; git -C C:/other commit -m b')))).toBe(false)
  })

  test('ignores a commit that is only text in a heredoc that cat or tee reads', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash("cat >> notes.md <<'EOF'\nthe git commit failed\nEOF")))).toBe(false)
    expect(denied(await $.tool.call(bash('cat > a.txt <<EOF\ngit commit -m x\nEOF\necho done')))).toBe(false)
    expect(denied(await $.tool.call(bash('cat > a.txt <<-"EOF"\n\tgit commit -m x\n\tEOF')))).toBe(false)
    expect(denied(await $.tool.call(bash("mkdir -p d && tee -a d/log.md >/dev/null <<'EOF'\ngit commit -m x\nEOF")))).toBe(false)
    expect(denied(await $.tool.call(bash("X=$(cat <<'EOF'\ngit commit -m x\nEOF\n)\necho \"$X\"")))).toBe(false)
    // Regression guard: a PowerShell here-string was already skipped whole as a quoted string.
    expect(denied(await $.tool.call(powershell("$m = @'\ngit commit -m x\n'@; Set-Content a.txt $m")))).toBe(false)
  })

  test('still sees a commit around a heredoc, or one a shell reads from it', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash("cat > a.txt <<'EOF'\nhello\nEOF\ngit commit -m x")))).toBe(true)
    expect(denied(await $.tool.call(bash('git commit -F - <<EOF\nfix: x\nEOF')))).toBe(true)
    expect(denied(await $.tool.call(bash('cat <<EOF > a.txt && git commit -m x\nhello\nEOF')))).toBe(true)
    // An apostrophe in a body or a comment must not open a quote that hides the commit after it.
    expect(denied(await $.tool.call(bash("cat > a.txt <<'EOF'\ndon't\nEOF\ngit commit -m 'x'")))).toBe(true)
    expect(denied(await $.tool.call(bash("# don't forget\ncat > f <<EOF\nit's\nEOF\ngit commit -m 'x'")))).toBe(true)
    // With no end line, the << may be a shift rather than a heredoc, so what follows still counts.
    expect(denied(await $.tool.call(bash("cat <<'EOF'\ngit commit -m x")))).toBe(true)
    expect(denied(await $.tool.call(bash('echo $((1 << n))\ngit commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(bash('echo $((1<<n))\ngit commit -m x\nn')))).toBe(true)
  })

  test('counts a heredoc body that may run: read by a shell, expanded, or written and then run', async ($, on) => {
    fakeRepo(on)
    for (const reader of ['bash', '/bin/bash', 'sh -s', '. /dev/stdin', '$SHELL', 'sudo -s', 'make -f -', 'cmd']) {
      expect(denied(await $.tool.call(bash(`${reader} <<'EOF'\ngit commit -m x\nEOF`)))).toBe(true)
    }
    expect(denied(await $.tool.call(bash("bash<<'EOF'\ngit commit -m x\nEOF")))).toBe(true)
    expect(denied(await $.tool.call(bash('cat >> notes.md <<EOF\nCommitted: $(git commit -q -m x && git rev-parse HEAD)\nEOF')))).toBe(true)
    expect(denied(await $.tool.call(bash("cat > /tmp/s.sh <<'EOF'\ngit commit -m x\nEOF\nbash /tmp/s.sh")))).toBe(true)
    expect(denied(await $.tool.call(bash("cat > s.sh <<'EOF' && chmod +x s.sh && ./s.sh\ngit commit -m x\nEOF")))).toBe(true)
    expect(denied(await $.tool.call(bash("cat > s.sh <<'EOF'\ngit commit -m x\nEOF\n. ./s.sh")))).toBe(true)
    expect(denied(await $.tool.call(bash("cat > s.txt <<'EOF'\ngit commit -m x\nEOF\npython3 run.py s.txt")))).toBe(true)
    for (const run of ['timeout 60 ./s.sh', 'winpty ./s.sh', 'start s.sh', 'cp s.sh .git/hooks/post-merge']) {
      expect(denied(await $.tool.call(bash(`cat > s.sh <<'EOF'\ngit commit -m x\nEOF\n${run}`)))).toBe(true)
    }
    expect(denied(await $.tool.call(bash("cat > justfile <<'EOF'\nc:\n    git commit -m x\nEOF\njust c")))).toBe(true)
    expect(denied(await $.tool.call(bash("cat <<'EOF' | tee f.sh >/dev/null\n#!/bin/sh\ngit commit -m x\nEOF\nnice ./f.sh")))).toBe(true)
  })

  test('leaves the command as it is where it cannot follow the quoting', async ($, on) => {
    fakeRepo(on)
    for (const command of [
      'echo \\ #; git commit -m x',
      'y="foo # c"; echo ${y%% #*}; git commit -m x',
      "echo $'a\\'b' 'c #d'; git commit -m x",
      "echo \"$(echo \"it's\")\"\necho 'a #b'; git commit -m x",
      "gh pr create --body \"$(cat <<'EOF'\nSupport 5\" displays\nEOF\n)\"\necho \"chore: refs #12\" && git commit -m y",
      "echo \"${x:-\"it's\"}\"\necho 'Notes (cat <<EOF keeps formatting)\nand more' && git commit -m x\nEOF",
    ]) {
      expect(denied(await $.tool.call(bash(command)))).toBe(true)
    }
  })

  test('takes a << in a comment or a string for text, not a heredoc', async ($, on) => {
    fakeRepo(on)
    expect(denied(await $.tool.call(bash("# append notes with cat <<EOF\ngit commit -m x\ncat >> notes.md <<'EOF'\ndone\nEOF")))).toBe(true)
    expect(denied(await $.tool.call(bash("echo \"plan: write it with cat <<EOF\nthen commit\"\ngit commit -m x\ncat > f <<'EOF'\nhi\nEOF")))).toBe(true)
    expect(denied(await $.tool.call(bash("echo \"a \\\" ; cat <<EOF b\"\ngit commit -m x\ncat > f <<'EOF'\nhi\nEOF")))).toBe(true)
    expect(denied(await $.tool.call(bash("X=$(cat <<'EOF'\nnote\nEOF)\ngit commit -m \"$X\"\ncat > f <<'EOF'\ny\nEOF")))).toBe(true)
    expect(denied(await $.tool.call(bash("cat <<< 'x'\ngit commit -m x\ncat > f <<'EOF'\ny\nEOF")))).toBe(true)
    // PowerShell has no heredoc: its text is read as it is.
    expect(denied(await $.tool.call(powershell("$s = @\"\nuse cat <<EOF\n\"@\ngit commit -m x\n$t = @'\nEOF\n'@")))).toBe(true)
  })

  test('sees a commit behind any git option', async ($, on) => {
    fakeRepo(on, { cwd: 'C:/other' })
    expect(denied(await $.tool.call(bash(`git --no-pager -C ${ROOT} commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`git --work-tree=${ROOT} --git-dir=${ROOT}/.git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`git -c user.name=x -C ${ROOT} commit -m x`)))).toBe(true)
  })

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

// Linux and macOS: the repo, the session and every path in POSIX spelling, with no drive letter anywhere.
describe('default-branch guard on POSIX paths', () => {
  test('blocks an edit and a commit on main, and lets a task branch through', async ($, on) => {
    fakeRepo(on, { root: POSIX_ROOT })
    expect(denied(await $.tool.call(edit(`${POSIX_ROOT}/src/a.go`)))).toBe(true)
    expect(denied(await $.tool.call(write('src/b.go')))).toBe(true)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(true)
    expect(denied(await $.tool.call(edit(`${POSIX_ROOT}/.claude/laa/local/runs/main.md`)))).toBe(false)
  })

  test('allows edits on a task branch', async ($, on) => {
    fakeRepo(on, { root: POSIX_ROOT, branch: 'feat/x' })
    expect(denied(await $.tool.call(edit(`${POSIX_ROOT}/src/a.go`)))).toBe(false)
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
  })

  test('takes the commit directory from cd, -C, and a subshell', async ($, on) => {
    fakeRepo(on, { root: POSIX_ROOT, cwd: '/home/me/other' })
    expect(denied(await $.tool.call(bash('git commit -m x')))).toBe(false)
    expect(denied(await $.tool.call(bash(`cd ${POSIX_ROOT} && git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`git -C ${POSIX_ROOT} commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`cd ../r && git commit -m x`)))).toBe(true)
    expect(denied(await $.tool.call(bash(`(cd ${POSIX_ROOT} && make); git commit -m x`)))).toBe(false)
  })

  test('leaves a path outside the repo alone and never maps it to a drive', async ($, on) => {
    fakeRepo(on, { root: POSIX_ROOT })
    expect(denied(await $.tool.call(edit('/tmp/scratch.txt')))).toBe(false)
    expect(denied(await $.tool.call(edit('/home/me/other/a.go')))).toBe(false)
  })
})

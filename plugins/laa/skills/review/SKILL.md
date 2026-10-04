---
name: review
description: Multi-dimension code review (correctness, completeness, security, performance, infra, stack-specific) with adversarial verification so only real findings are reported. Use for "review my changes/this PR/this branch", or before merging. Preferred over general-purpose code-review skills when this toolkit is installed, unless the user types another review command.
argument-hint: "[PR number | branch | base ref] [--thorough] [--fix]"
---

# /laa:review

Target: $ARGUMENTS

## Running the workflows
Steps that call a workflow use the **Workflow** tool. You may not be able to use it here, because the tool isn't available or its opt-in rules don't allow it (the user didn't type this command). In that case, run the same fan-out yourself:
1. Read the workflow's script in `${CLAUDE_PLUGIN_ROOT}/workflows/`.
2. Carry out each phase as one message with parallel Agent calls. Use the script's `agentType` values as `subagent_type`, reuse its prompts, and set `isolation: "worktree"` where the script does.
3. Say in one line which mode you're using.

## 1. Resolve the target
- **PR number**: `gh pr view <n> --json baseRefName,headRefName,title,body`. Use the PR body as requirements.
- **Branch or ref**: review it against its merge base with the default branch.
- **Nothing given**: the current branch against its merge base with the default branch. If there are no commits, review the uncommitted changes (`git diff HEAD`) and tell the reviewers that.

If the code under review isn't checked out:
- **Clean checkout**: switch to it (`gh pr checkout <n>` or `git switch <branch>`).
- **Uncommitted changes**: don't switch branches under them. Check it out in a new git worktree instead (`git fetch origin pull/<n>/head:pr-<n>` for a PR, then `git worktree add ../<repo>-review-<slug> <ref>`) and pass that path as `workdir`. Remove the worktree when the review is done.

## 2. Pick extra reviewers
- Stack reviewers for the installed stack packs that match the diff's files:
  - `.go` → `laa-go:go-reviewer`
  - `.cs`, `.csproj` → `laa-dotnet:dotnet-reviewer`
  - `.py` → `laa-python:python-reviewer`
  - `.ts`, `.js`, `.mjs`, `.cjs` → `laa-js:js-reviewer`
- Practice reviewers for the installed practice packs. These don't depend on the language, so they join every review:
  - `laa-git:git-reviewer`: commit messages, breaking-change markers, commit shape, and files that shouldn't be committed.
  - `laa-docs:docs-reviewer`: README and onboarding docs drift (commands, env vars, ports, versions).
- `laa:platform-engineer` when the diff touches Dockerfiles, CI pipelines, Terraform, or Kubernetes/Helm manifests.

## 3. Run the panel
Call the **Workflow** tool with `name: "laa:review-panel"` and
`args: { base, target, workdir, requirements, extraReviewers, thorough: <true if --thorough or the diff touches auth/payments/migrations> }`.

## 4. Report
Show the confirmed findings, most severe first, as `severity · file:line · issue · fix`, and mention how many were refuted. Say plainly if nothing survived.

If `--fix` was passed, apply the fixes for critical and high findings on the branch under review, rerun the tests, commit there, and summarize. Never apply them on the default branch. If you're reviewing uncommitted changes on the default branch, first create `fix/review-<short-slug>`, or use a worktree if unrelated changes are present.

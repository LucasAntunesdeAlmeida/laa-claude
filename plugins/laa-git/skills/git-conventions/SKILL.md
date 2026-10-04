---
name: git-conventions
description: Git conventions for commits, branches, history, and pull requests (Conventional Commits by default). Use whenever writing a commit message, naming a branch, squashing or rebasing, writing a PR title or description, or tagging a release, in any language. Also use for "commit this", "write the commit message", "open a PR", "what should I name this branch". The repo's CONTRIBUTING, CLAUDE.md, and existing history override these defaults.
---

# Git conventions

**Precedence: the repo's CONTRIBUTING, `CLAUDE.md`, `.claude/laa/project-map.md`, and its existing `git log` style override everything here.** Check `git log --oneline -20` before the first commit. If the history clearly follows another convention, follow that one instead.

The laa core rule still applies: never commit on the default branch. Use a task branch, or a git worktree when the checkout has unrelated uncommitted changes.

## Branches
- Name branches `<type>/<short-slug>`, e.g. `feat/invoice-export` or `fix/null-billing-address`. Use the same types as commits, plus `migrate/`.
- If there's a ticket, put its key first: `feat/ABC-123-invoice-export`.
- Use lowercase and hyphens, and keep names under ~50 characters. Don't put personal names or dates in them.
- Keep one branch per task. Delete it after it's merged.

## Commit messages: Conventional Commits 1.0
```
<type>(<scope>)!: <subject>

<body: why this change, and what it changes at a high level>

BREAKING CHANGE: <what breaks and how to migrate>
Refs: #123
```
- **type**: `feat` · `fix` · `perf` · `refactor` · `test` · `docs` · `build` · `ci` · `chore` · `revert`.
- **scope**: the module, package, or domain touched (`billing`, `api`, `auth`). Omit it when the change is repo-wide.
- **subject**: imperative mood ("add", not "added" or "adds"). Start lowercase, no trailing period, at most 72 characters (aim for 50).
- **`!` and `BREAKING CHANGE:`**: use both for any change that breaks a public contract: an API field or route, an event schema, a config key or env var, a CLI flag, or a DB change that isn't backward compatible. The footer says how consumers migrate.
- **body**: wrap at 72 characters. Explain *why*, and mention any non-obvious trade-off. Leave out the *how*: the diff shows that. Skip the body for self-explanatory changes.
- **footers**: `Refs: #123` or `Closes #123` for issues. Use `Co-authored-by:` only for real human co-authors.
- **No AI attribution**: no `Co-Authored-By: Claude …`, no "Generated with …" lines in commits or PR bodies, unless the repo's CONTRIBUTING explicitly requires them.

## Commit content
- Make one logical change per commit. Put tests in the same commit as the code they cover.
- Every commit builds and passes its tests, so `git bisect` keeps working.
- Don't mix reformatting or renames with behavior changes. Put them in a separate `refactor:` or `style:` commit first.
- Never commit secrets, `.env` files, local settings (`.claude/settings.local.json`, IDE folders), build output, or absolute local paths. If one is already tracked, say so rather than silently deleting it.
- Squash `wip`, `fixup!`, and "address review" commits into their logical commit before the PR is merged.

## History
- To update your branch, rebase it onto the default branch. Don't merge the default branch into it, unless the repo's history shows merge commits are the norm.
- Never rewrite history that others have pulled. Rewriting your own unshared branch is fine. Use `git push --force-with-lease`, never `--force`, and only when the user asked you to push.
- Never push, merge, or open a PR unless the user asks.

## Pull requests
- **Title**: written as a Conventional Commit subject, because squash merges use it as the commit message.
- **Body**:
  1. **What and why**: two or three sentences, plus the linked issue.
  2. **How it was tested**: commands run, and any manual steps.
  3. **Risk and rollback**: migrations, feature flags, config changes, and breaking changes, each with its migration note.
  4. **Screenshots or sample output**: only when behavior visible to users or API clients changes.
- **Size**: aim for under ~400 changed lines. Split bigger work into stacked PRs, or into a foundation PR followed by slices.
- Open a draft PR when you want early feedback on direction.

## Releases
- Tag releases `vMAJOR.MINOR.PATCH` (SemVer). Bump MAJOR for a `!` or `BREAKING CHANGE`, MINOR for `feat`, and PATCH for `fix` and `perf`.
- Write release notes from the Conventional Commit history, grouped by type. List breaking changes first.

## Definition of done (git)
- [ ] The work is on a task branch, not the default branch.
- [ ] Each commit is one logical change and builds green.
- [ ] Messages follow the convention, and breaking changes are marked.
- [ ] There are no secrets, local files, or AI attribution lines.
- [ ] The PR body covers what/why, testing, and risk.

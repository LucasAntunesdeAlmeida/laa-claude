---
name: git-conventions
description: Git conventions for commits, branches, history, and pull requests (Conventional Commits by default). Use whenever writing a commit message, naming a branch, squashing or rebasing, force-pushing, writing a PR title or description, bumping a version, tagging a release, fixing line endings, or dealing with a secret or credential that was committed, in any language. Also use for "commit this", "write the commit message", "open a PR", "what should I name this branch", "cut a release", "what version is this", "I committed my API key". The repo's CONTRIBUTING, CLAUDE.md, and existing history override these defaults.
---

# Git conventions

**Precedence: the repo's CONTRIBUTING, `CLAUDE.md`, `AGENTS.md`, `.claude/laa/project-map.md`, and its existing `git log` style override everything here.** One exception: on AI attribution, the user's own instructions (their `CLAUDE.md` or memory) beat the repo's. Before the first commit message, check `git log --oneline -20` and read CONTRIBUTING and `AGENTS.md` if present (commit rules, AI-disclosure policy). If the history clearly follows another convention, follow that one instead.

The laa core rule still applies: never commit on the default branch. Use a task branch, or a git worktree when the checkout has unrelated uncommitted changes.

## Branches
- Name branches `<type>/<short-slug>`, e.g. `feat/invoice-export` or `fix/null-billing-address`. Use the same types as commits, plus `migrate/`.
- If there's a ticket, put its key first: `feat/ABC-123-invoice-export`.
- Use lowercase and hyphens, and keep names under ~50 characters. Don't put personal names or dates in them.
- Keep branches short-lived (aim for a few days) with one owner (or one pair). Split bigger work rather than letting a branch age. Delete it after it's merged.

## Commit messages: Conventional Commits 1.0
```
<type>(<scope>)!: <subject>

<body: why this change, and what it changes at a high level>

BREAKING CHANGE: <what breaks and how to migrate>
Refs: #123
```
- **type**: `feat` · `fix` · `perf` · `refactor` · `style` · `test` · `docs` · `build` · `ci` · `chore` · `revert`.
- **scope**: the module, package, or domain touched (`billing`, `api`, `auth`). Omit it when the change is repo-wide.
- **subject**: imperative mood ("add", not "added" or "adds"). Start lowercase, no trailing period, at most 72 characters (aim for 50).
- **`!` and `BREAKING CHANGE:`**: use both for any change that breaks a public contract: an API field or route, an event schema, a config key or env var, a CLI flag, or a DB change that isn't backward compatible. The footer says how consumers migrate.
- **body**: wrap at 72 characters. Explain *why*, and mention any non-obvious trade-off. Leave out the *how*: the diff shows that. Skip the body for self-explanatory changes.
- **footers**: `Refs: #123` or `Closes #123` for issues. Use `Co-authored-by:` only for real human co-authors.
- **reverts**: `revert: <subject of the reverted commit>` with a `Refs: <sha>` footer naming the reverted commit(s).
- **No AI attribution by default**: no `Co-Authored-By: Claude …`, no "Generated with …" lines in commits or PR bodies. Read CONTRIBUTING and `AGENTS.md` for a disclosure rule first, even when you only draft the message.
  - Exception: the repo's policy (CONTRIBUTING, `AGENTS.md`, or a policy doc) **requires** disclosure. Then use exactly the trailer form it requires (e.g. `Assisted-by: …`), and nothing more. A policy that only allows or suggests it doesn't count.
  - If the user's own instructions forbid AI attribution, don't add it even then. Tell the user the repo requires `<form>` and let them decide.
  - Never add `Signed-off-by:` or use `git commit -s` yourself: only a human can certify the DCO. If the repo requires sign-off, tell the user they need to add it.

## Commit content
- Make one logical change per commit. Put tests in the same commit as the code they cover.
- Every commit builds and passes its tests, so `git bisect` keeps working.
- Don't mix reformatting or renames with behavior changes. Put them in a separate `refactor:` or `style:` commit first.
- Never commit secrets, `.env` files, local settings (`.claude/settings.local.json`, IDE folders), build output, or absolute local paths. If one is already tracked, say so rather than silently deleting it.
- Squash `wip`, `fixup!`, and "address review" commits into their logical commit before the PR is merged. Without `-i`: `git commit --fixup=<sha>`, then `git rebase --autosquash <base>` (non-interactive `--autosquash` needs Git 2.44 or later).

## A secret was committed
1. **Revoke or rotate the credential first.** Once it's pushed, treat it as leaked: deleting the file or a later commit does not remove it from history, clones, forks, or caches. Rotation alone is often enough.
2. Then remove it from the working tree (`git rm --cached <file>`, add it to `.gitignore`, load it from the environment or a secret store instead).
3. Only if still warranted, rewrite history with `git-filter-repo` (`--sensitive-data-removal`). This needs coordination with everyone who has a clone, changes every later SHA, and drops commit and tag signatures. Ask the user first; never do it on your own. Follow https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- For a non-secret file committed by mistake (build output, IDE folder), `git rm --cached <file>` plus `.gitignore` is enough.

## Line endings
- Don't rely on each machine's `core.autocrlf`. Pin line endings in a committed `.gitattributes`:
  ```
  * text=auto
  *.sh text eol=lf
  *.bat text eol=crlf
  *.cmd text eol=crlf
  ```
- After adding or changing it, run `git add --renormalize .` and commit that in its **own** commit (e.g. `chore: normalize line endings`), separate from any other change.
- A `.sh` file committed with CRLF breaks on Linux and macOS (`/bin/sh^M: bad interpreter`).

## Signing
- If the repo requires signed commits (branch protection, CONTRIBUTING) or `commit.gpgsign` is set, never bypass signing (`--no-gpg-sign`, `-c commit.gpgsign=false`). If signing fails, stop and tell the user.
- GitHub's "Rebase and merge" creates commits GitHub can't sign. In a repo that requires signatures, use squash or a merge commit. A maintainer can also rebase-merge locally with signed commits.

## History
- To update your branch, rebase it onto the default branch. Don't merge the default branch into it, unless the repo's history shows merge commits are the norm.
- Never rewrite history that others have pulled. Rewriting your own unshared branch is fine.
- Force-push with `git push --force-with-lease --force-if-includes` (or set `push.useForceIfIncludes=true`), never `--force`. A background fetch (IDE, `git fetch --all`) updates the remote-tracking ref and silently defeats a plain `--force-with-lease`. Only push when the user asked.
- Never push, merge, or open a PR unless the user asks.

## Pull requests
- **Title**: written as a Conventional Commit subject.
- **Squash merges**: GitHub's default squash message is the PR title plus a list of commits only when the PR has 2+ commits; a one-commit PR uses that commit's own message. The commit list is not a parseable `BREAKING CHANGE:` footer. So if **any** commit in the PR is breaking, put `!` in the PR title and the `BREAKING CHANGE:` footer in the PR body.
- **Body**:
  1. **What and why**: two or three sentences, plus the linked issue.
  2. **How it was tested**: commands run, and any manual steps.
  3. **Risk and rollback**: migrations, feature flags, config changes, and breaking changes, each with its migration note.
  4. **Screenshots or sample output**: only when behavior visible to users or API clients changes.
- **Size**: aim for under ~400 changed lines. Split bigger work into stacked PRs, or into a foundation PR followed by slices.
- Open a draft PR when you want early feedback on direction.

## Releases
- **Check for release tooling first.** If the repo has `release-please-config.json` (or `.release-please-manifest.json`), a semantic-release config (`.releaserc*`, `release.config.{js,cjs,mjs}`, or a `"release"` key in `package.json`), a `.changeset/` folder, or a CI workflow that runs `release-please-action` or `semantic-release`, the tool owns versions, tags, and `CHANGELOG.md`. Don't hand-tag, hand-bump versions, or hand-edit the changelog.
  - release-please: correct Conventional Commits drive the bump. Under 0.x, read `bump-minor-pre-major` in its config before predicting the bump. To force a version, add a `Release-As: x.y.z` footer to a commit.
  - semantic-release: correct Conventional Commits drive the bump.
  - Changesets: add a `.changeset/<name>.md` with the bump type per package (`npx changeset`) in the same PR.
- **Without tooling**, use SemVer. The version is `MAJOR.MINOR.PATCH`; the `v` belongs only to the tag (`v1.4.0` tags version `1.4.0`, so manifests say `1.4.0`).
  - From 1.0.0 on: bump MAJOR for a `!` or `BREAKING CHANGE`, MINOR for `feat`, PATCH for `fix` and `perf`.
  - Under 0.y.z, SemVer only says "anything MAY change". A breaking change bumps MINOR, not MAJOR (`0.4.2` → `0.5.0`): the common 0.x convention. release-please does this only with `"bump-minor-pre-major": true`, otherwise it goes to 1.0.0. `feat` also bumps MINOR, `fix` and `perf` PATCH. Don't jump to 1.0.0 just because something broke; 1.0.0 is a deliberate "stable API" decision for the user.
- Write release notes from the Conventional Commit history, grouped by type. List breaking changes first.

## Definition of done (git)
- [ ] The work is on a task branch, not the default branch.
- [ ] Each commit is one logical change and builds green.
- [ ] Messages follow the convention, and breaking changes are marked (in the PR title too, for squash merges).
- [ ] There are no secrets, local files, or AI attribution lines the repo's policy doesn't require.
- [ ] The PR body covers what/why, testing, and risk.

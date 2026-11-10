---
type: llm
weight: 1
---

The workspace is a git repo. The branch feat/order-camelcase (against main) has a breaking commit
correctly marked `feat(api)!:` with a `BREAKING CHANGE:` footer, a commit
`feat(payments): add payments client config` that adds config/payments.json containing a live
payments API key (`pay_live_...`), and a plain `fix`. The user plans to open the PR titled
"feat(api): use camelCase in order responses" (no `!`) and squash-merge it. They asked for the
laa-git:git-reviewer agent's findings, relayed, and said they will handle the key with
`git rm --cached config/payments.json` plus `.gitignore`. The eval gives the reviewer no shell, so
it may only see the files and commit subjects.

The response passes only if ALL of these hold:
- It still flags the committed key in config/payments.json (or that commit) as a secret, says the
  user's `git rm --cached` plan is not enough (the key stays in history), and the fix it gives
  STARTS with revoking or rotating (regenerating) the key, before any git command. Accepting the
  user's plan as handled, or listing removal before rotation, fails.
- It flags the PR title for lacking `!` (and/or a `BREAKING CHANGE:` footer in the PR body) because
  the branch has a breaking commit and a squash merge would otherwise lose the marker, and it gives
  the corrected title (e.g. `feat(api)!: use camelCase in order responses`).
- It does NOT assert that the `feat(api)!:` commit is an unmarked breaking change. Noting that it
  couldn't verify that commit's footer is fine.
- It does not claim it rewrote history, edited files, or rotated anything.

Saying that `git rm --cached` or a later commit leaves the key in history, or presenting
`git-filter-repo` as an optional coordinated later step, are pluses but not required.

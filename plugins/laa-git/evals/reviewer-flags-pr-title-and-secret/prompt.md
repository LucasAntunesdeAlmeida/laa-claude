---
name: reviewer-flags-pr-title-and-secret
description: Regression guard rather than a before/after discriminator. Without a shell in the eval the reviewer sees only files and subjects, and the old reviewer already flags both points. The laa-git reviewer, run on a branch with a marked `feat(api)!:` commit, a committed live payments key, and a planned PR title without `!`, flags the title (a squash merge would drop the breaking marker) and starts the secret's fix with revoking or rotating the key rather than `git rm --cached`. The user already plans `git rm --cached` for the key, which the reviewer must not accept as the fix.
tags: [git, review, secrets]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-git:git-reviewer agent to review the branch feat/order-camelcase against main in this repo, and relay its findings. there's no gh here, so tell it the PR doesn't exist yet: I'll open it with the title "feat(api): use camelCase in order responses" and squash-merge it. I know about the payments key, I'll just `git rm --cached config/payments.json` and gitignore it before I open the PR, so that one's handled. don't fix anything yourself

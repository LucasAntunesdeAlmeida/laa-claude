---
name: attribution-user-rule-beats-repo
description: The repo's CONTRIBUTING requires an `Assisted-by:` trailer, but the user's own CLAUDE.md forbids AI attribution in their commits. With laa-git, the commit message leaves the trailer out and tells the user the repo requires it so they can decide, instead of adding it because the repo policy wins.
tags: [git, commit, attribution]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

my global ~/.claude/CLAUDE.md says: "Never add AI attribution lines to my commits. Commits are authored solely by me."

write the commit message for the change I just made in cmd/tally/main.go: I added the -sep flag so you can pick the field separator (default is a comma). just give me the message

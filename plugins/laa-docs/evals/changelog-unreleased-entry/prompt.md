---
name: changelog-unreleased-entry
description: The user added an optional RATE_LIMIT_RPS env var in code only and asks for a commit message. The repo keeps a hand-written Keep a Changelog CHANGELOG.md with no release generator; the new guidance says the change also needs an Added entry under [Unreleased], which the old guidance never mentioned.
tags: [docs, changelog]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I added rate limiting: internal/config/config.go now reads RATE_LIMIT_RPS (optional, default 50). write the commit message for it, don't run git

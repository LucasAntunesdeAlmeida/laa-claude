---
name: changelog-unreleased-entry
description: The user added an optional RATE_LIMIT_RPS env var and asks for the docs to follow. The repo keeps a Keep a Changelog CHANGELOG.md; the new guidance adds an entry under [Unreleased] (Added) besides the README and .env.example, which the old guidance never mentioned.
tags: [docs, changelog]
runs: 3
max_turns: 16
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
---

I added rate limiting: internal/config/config.go now reads RATE_LIMIT_RPS (optional, default 50). update the docs for this change

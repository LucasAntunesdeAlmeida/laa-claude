---
name: stale-github-contributing
description: The user renamed DATABASE_URL to PG_DSN and already fixed README.md, .env.example, and the Makefile. The only stale doc is .github/CONTRIBUTING.md, which the old guidance (root README*/CONTRIBUTING* only) never looked at.
tags: [docs, drift]
runs: 3
max_turns: 14
allowed_tools: [Read, Glob, Grep, Skill]
---

I renamed DATABASE_URL to PG_DSN in internal/config/config.go and already updated the README, .env.example and the Makefile. check the docs side before I commit: is anything still stale? don't edit, just tell me

---
name: config-change-updates-docs
tags: [docs, drift]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I just renamed DATABASE_URL to PG_DSN and changed the default port to 9090 in internal/config/config.go. write the commit message for it, don't run git

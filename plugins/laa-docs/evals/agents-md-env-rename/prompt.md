---
name: agents-md-env-rename
description: The user renamed STRIPE_API_KEY to STRIPE_SECRET_KEY in code and asks for the docs to follow. AGENTS.md also cites the old name in its test command; the old same-change rule (README, onboarding, .env.example) leaves it stale.
tags: [docs, drift, agents-md]
runs: 3
max_turns: 16
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
---

I renamed STRIPE_API_KEY to STRIPE_SECRET_KEY in internal/config/config.go. update the docs so they match

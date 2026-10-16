---
name: agents-md-env-rename
description: Regression guard rather than a before/after discriminator. The model greps for the old name and finds AGENTS.md even without the pack, so the old guidance passes too. The user renamed STRIPE_API_KEY to STRIPE_SECRET_KEY, already updated README.md and .env.example, and asks for a commit message; the answer flags AGENTS.md's test command, which still exports the old name.
tags: [docs, drift, agents-md]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I renamed STRIPE_API_KEY to STRIPE_SECRET_KEY in internal/config/config.go and already updated the README and .env.example. write the commit message for it, don't run git

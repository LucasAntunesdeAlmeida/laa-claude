---
name: readme-no-invented-commands
description: Regression guard rather than a with/without discriminator. Plain Claude already writes a decent README from real files; this pins the laa-docs structure and the facts (real ports, real make targets, full config table) with deterministic checks on README.md.
tags: [docs, readme]
runs: 3
max_turns: 14
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

write the README for this service so a new dev can get it running on day one

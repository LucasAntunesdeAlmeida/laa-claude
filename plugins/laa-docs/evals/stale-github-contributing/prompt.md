---
name: stale-github-contributing
description: Regression guard rather than a before/after discriminator. The model globs for CONTRIBUTING* and finds the .github/ copy even without the pack, so the old guidance passes too. The repo already has .github/CONTRIBUTING.md, and the README doesn't link to it. Asked to add a CONTRIBUTING.md with a migrations section, the new guidance (search .github/, root, and docs/, and edit the one that exists) extends the .github/ file instead of creating a second CONTRIBUTING.md at the root.
tags: [docs, community-files]
runs: 3
max_turns: 16
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
---

add a CONTRIBUTING.md with a section about running migrations

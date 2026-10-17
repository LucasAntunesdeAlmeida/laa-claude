---
name: feature-researches-tool-facts
description: /laa:feature step 2 adds a research agent on an external tool's official docs when the feature encodes that tool's behavior, next to the code explorers, so the build and review work from verified facts instead of memory.
tags: [feature, research]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:feature run gitleaks on every commit (a pre-commit hook) and in CI, with an allowlist for the test fixtures under testdata/

there's no shell here, so don't create a branch. do steps 1 and 2 only: size it, then list the agents you'd launch in step 2, what each one looks into, and what it returns. stop before launching any of them.

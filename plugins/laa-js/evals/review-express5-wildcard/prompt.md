---
name: review-express5-wildcard
description: Regression guard rather than a before/after discriminator. The base model knows these Express 5 traps, so the pre-0.2.0 reviewer often catches them too. The laa-js reviewer catches Express 5 upgrade breakage in unchanged route code, an unnamed `app.get('/*', ...)` wildcard that throws at startup and a bare `express.urlencoded()` that stops parsing nested form fields (it now defaults to extended false), instead of approving a version-bump-only diff.
tags: [review, express, upgrade]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-js:js-reviewer agent to review this change and relay its findings, don't review it yourself: "This is a routine dependency-update PR: only package.json changed, no source files. Is it safe to merge? Don't edit files."

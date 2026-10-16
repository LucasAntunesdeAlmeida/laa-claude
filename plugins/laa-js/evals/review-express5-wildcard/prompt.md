---
name: review-express5-wildcard
description: The laa-js reviewer catches Express 5 upgrade breakage in unchanged route code, starting with an unnamed `app.get('/*', ...)` wildcard that throws at startup, instead of approving a version-bump-only diff.
tags: [review, express, upgrade]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-js:js-reviewer agent to review this change and relay its findings, don't review it yourself: "The diff only bumps express from ^4.21.2 to ^5.1.0 in package.json (and the lockfile to match). No source files changed; the routes are in src/app.ts. Is this safe to merge? Don't edit files."

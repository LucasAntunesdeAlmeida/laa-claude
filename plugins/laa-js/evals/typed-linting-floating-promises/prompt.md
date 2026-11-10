---
name: typed-linting-floating-promises
description: A TS service on ESLint 10 still has a legacy .eslintrc.cjs that turns on no-floating-promises without type information. With laa-js, the fix is a flat eslint.config.js with typescript-eslint's type-checked preset and parserOptions.projectService, not another tweak to the eslintrc or the bare rule.
tags: [lint, typescript, eslint]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

we turned on no-floating-promises in our lint config a while ago but it never flagged anything, and src/jobs/sync.ts definitely kicks off a promise nobody awaits. we also bumped eslint recently. what's wrong with the lint setup and what's the fix? give me the exact file changes, don't run anything

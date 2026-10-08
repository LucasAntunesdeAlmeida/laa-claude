---
name: routes-investigate-to-fix
description: Regression guard for the engine labels. A plain-language "investigate this bug" should reach the /laa:fix entry skill, not the investigate engine that skips reproduction, the fix, and review.
tags: [routing, fix]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

can you investigate why GET /invoices/{id} returns 500 when the customer has no billing address

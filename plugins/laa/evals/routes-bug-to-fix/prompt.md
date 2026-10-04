---
name: routes-bug-to-fix
tags: [routing, fix]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

lets fix the bug where GET /invoices/{id} returns 500 when the customer has no billing address

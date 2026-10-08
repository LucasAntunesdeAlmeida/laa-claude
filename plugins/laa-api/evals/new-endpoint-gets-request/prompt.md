---
name: new-endpoint-gets-request
description: Regression guard rather than a before/after discriminator. The existing .bru collection shows the pattern, so the model follows it without the pack (see api-tests-from-scratch for the discriminator). The user added a cancel endpoint in code only, and the answer updates api/openapi.yaml and adds a Bruno request for it to the existing collection, with a docs block, status assertions, {{baseUrl}}, and inherited auth instead of a hardcoded token.
tags: [api, bruno, openapi]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I just added a cancel endpoint, POST /orders/:id/cancel in src/routes/orders.js. what else should change in this PR before I open it? give me the exact file changes, don't run anything

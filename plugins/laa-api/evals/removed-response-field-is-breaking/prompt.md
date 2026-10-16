---
name: removed-response-field-is-breaking
description: The user removed a required response field (legacyCode) from GET /customers/{id} as "cleanup" and asks for the matching spec and Bruno updates. The old guidance only said to call out the break, with no mechanical check. The answer flags the removal as a breaking change, names an oasdiff breaking check (locally or as a CI step that fails on ERR), and points to deprecation or a versioning decision before shipping the removal.
tags: [api, openapi, breaking-change, oasdiff]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I dropped legacyCode from the customer response in src/routes/customers.js, just cleanup. update the openapi spec and the bruno request to match. show the diffs, don't run anything

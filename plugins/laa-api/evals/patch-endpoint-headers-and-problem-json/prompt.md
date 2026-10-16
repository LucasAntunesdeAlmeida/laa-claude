---
name: patch-endpoint-headers-and-problem-json
description: The user added PATCH /orders/{id} in code and asks for the spec diff. The handler sets an ETag on 200 and writes errors through error middleware that sends RFC 9457 problem details as application/problem+json, while the existing spec (which the user asks to copy) documents errors as application/json and lists no headers. The old checklist covered status codes and schemas only, so the answer copied the existing operations. The answer documents the ETag response header and uses application/problem+json for the 404 and 422 responses.
tags: [api, openapi, headers, problem-details]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I added PATCH /orders/:id in src/routes/orders.js. add it to api/openapi.yaml in the same style as the GET, show me the diff, don't run anything

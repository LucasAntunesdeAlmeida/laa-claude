---
name: review-zod-env-stringbool
description: The laa-js reviewer catches a Zod 4 env schema that parses boolean flags with z.coerce.boolean(), where the string "false" becomes true, and recommends z.stringbool().
tags: [review, zod, config]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-js:js-reviewer agent to review this change and relay its findings, don't review it yourself: "The diff adds src/config/env.ts (a Zod 4 env schema, zod ^4.1 in package.json) and uses it from src/server.ts. Nothing else changed. Production sets REQUIRE_AUTH=false only on the internal admin deployment and DEBUG_SQL=false everywhere. Don't edit files."

---
name: review-zod-env-stringbool
description: Regression guard rather than a before/after discriminator. The base model knows the z.coerce.boolean() trap and the Zod 4 deprecations, so the pre-0.2.0 reviewer often catches them too. The laa-js reviewer catches a Zod 4 env schema that parses boolean flags with z.coerce.boolean(), where the string "false" becomes true, and recommends z.stringbool(), and flags the Zod 4 deprecated forms (z.string().email() / .url(), the message param) in the new code.
tags: [review, zod, config]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-js:js-reviewer agent to review this change and relay its findings, don't review it yourself: "The diff adds src/config/env.ts and uses it from src/server.ts. Nothing else changed. Don't edit files."

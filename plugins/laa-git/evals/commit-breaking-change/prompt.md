---
name: commit-breaking-change
tags: [git, commit]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

write the commit message for this change, don't run git: in the invoices module I renamed the JSON field `customer_id` to `customerId` in the GET /invoices/{id} response, because the mobile app expects camelCase. it's for issue #412

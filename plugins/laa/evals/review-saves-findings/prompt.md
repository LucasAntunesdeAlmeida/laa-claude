---
name: review-saves-findings
description: /laa:review reports confirmed findings with the contract's severity tags and saves them to .claude/laa/local/last-review.md for the findings pane.
tags: [review, output, findings]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

/laa:review fix/invoice-500

there's no shell here, so take my word for it: the review panel already ran against main with correctness, completeness, security, performance, and go reviewers, refuted 5 findings, and confirmed these two:
- high, internal/billing/invoice.go line 88: nil address dereference on legacy rows. fix: guard with addr == nil and render an empty address block
- medium, internal/billing/invoice.go line 120: query in a loop over line items (N+1). fix: preload line items with one join

do step 4 only: report them and save them

---
name: review-adds-api-reviewer
description: Regression guard rather than a before/after discriminator. With laa-api installed, the model already finds api-reviewer without the review skill listing it; this pins that /laa:review puts laa-api:api-reviewer on the panel for a diff that adds an HTTP endpoint, and leaves out reviewers from packs that aren't installed and platform-engineer when no infra file changed.
tags: [review, routing, api]
plugins: ["../../plugins/laa", "../../plugins/laa-api"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:review feat/order-refunds

there's no shell here, so take my word for the diff: the branch only changes internal/http/routes.go and internal/http/refunds.go (adds a POST /orders/{id}/refunds handler). do steps 1 and 2 only: list the reviewers you'd put on the panel and why, then stop before running it

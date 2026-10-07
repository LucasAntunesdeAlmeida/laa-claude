---
name: review-adds-docker-reviewer
description: Regression guard rather than a before/after discriminator. With laa-docker installed, the model already finds docker-reviewer without the review skill listing it; this pins that it joins a review with no Docker files in the diff, and that platform-engineer and uninstalled packs stay out.
tags: [review, routing, docker]
plugins: ["../../plugins/laa", "../../plugins/laa-docker"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:review feat/order-cache

there's no shell here, so take my word for the diff: the branch only changes go.mod, internal/cache/cache.go, and internal/config/config.go (adds a go-redis client and a REDIS_URL setting). do steps 1 and 2 only: list the reviewers you'd put on the panel and why, then stop before running it

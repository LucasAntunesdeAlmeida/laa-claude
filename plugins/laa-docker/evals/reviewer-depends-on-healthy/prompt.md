---
name: reviewer-depends-on-healthy
description: The docker-reviewer flags a new worker service that uses short-form `depends_on` on a health-checked Postgres (it only waits for "running") and asks for `condition: service_healthy`, and flags its fixed `container_name`. The old guidance treated the healthcheck alone as enough.
tags: [docker, review, compose]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-docker:docker-reviewer agent to review this and relay its findings, don't do anything else yourself: "Review the branch feat/outbox-worker. There's no shell, so take the diff from me: it only changes compose.yaml, adding the `worker` service (everything else in that file was already on main). The worker runs the outbox relay against Postgres on startup."

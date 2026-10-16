---
name: reviewer-depends-on-healthy
description: Regression guard rather than a before/after discriminator. The model already knows that short-form `depends_on` waits only for "running", so it flags this without the new startup-order check (a subtler service_started variant didn't discriminate either). The docker-reviewer flags a new worker service that uses short-form `depends_on` on a health-checked Postgres and asks for the long form with service_healthy, and flags its fixed `container_name`.
tags: [docker, review, compose]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-docker:docker-reviewer agent to review this and relay its findings, don't do anything else yourself: "Review the branch feat/outbox-worker. There's no shell, so take the diff from me: it only changes compose.yaml, adding the `worker` service (everything else in that file was already on main)."

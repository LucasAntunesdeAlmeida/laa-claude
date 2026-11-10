---
name: reviewer-postgres18-mount
description: The docker-reviewer flags a Postgres 17.6 to 18.1 bump that keeps the data volume at /var/lib/postgresql/data. On 18+ the official entrypoint refuses to start with that mount, and the old 17 volume can't simply be remounted at /var/lib/postgresql, so the fix is a new named volume there (or pg_upgrade / dump-restore), keeping the old one. The old reviewer had no Postgres mount check.
tags: [docker, review, postgres]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-docker:docker-reviewer agent to review this and relay its findings, don't do anything else yourself: "Review the branch chore/postgres-18. There's no shell, so take the diff from me: it only changes the Postgres image from postgres:17.6 to postgres:18.1 in compose.yaml and .github/workflows/ci.yml. Production moved to 18.1 last week. Teammates already have a local db-data volume from 17."

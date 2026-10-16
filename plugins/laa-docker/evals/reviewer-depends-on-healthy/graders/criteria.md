---
type: llm
weight: 1
---

compose.yaml has a `db` service on `postgres:16.4` with a `pg_isready` healthcheck, and the branch adds a
`worker` service that connects to Postgres on startup. The worker uses short-form `depends_on: [db]` and
sets `container_name: orders-worker`.

The response passes only if ALL of these hold:
- It flags the worker's short-form `depends_on` and explains that it waits only until `db` is running
  (started), not healthy, even though `db` has a healthcheck.
- Its fix is the long form with `condition: service_healthy` under `depends_on.db`.
- It flags the fixed `container_name` as breaking a second copy of the stack (another worktree or project)
  or scaling, and suggests removing it.
- It does not say the healthcheck alone makes the worker wait for Postgres.

Mentioning `restart: true`, `start_period`, or that the image tag and volume are fine are pluses but not
required. Flagging `golang:1.23` in the Dockerfile is neither required nor a failure.

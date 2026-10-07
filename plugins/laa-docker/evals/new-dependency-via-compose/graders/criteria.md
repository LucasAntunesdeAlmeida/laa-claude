---
type: llm
weight: 1
---

The workspace runs Postgres through compose.yaml (`postgres:16.4`, a healthcheck, a named volume,
and a host port behind `${DB_PORT:-5434}`), and `make test-integration` runs `docker compose up -d --wait`.
The user added a go-redis client that reads REDIS_URL, has no Redis installed, and asked what to set up
without running anything.

The response passes only if ALL of these hold:
- It adds a `redis` service to compose.yaml (not an ad-hoc `docker run`, and not a host install such as
  `brew install redis`, `apt install redis-server`, or `choco install redis` as the main path).
- The service image has an explicit version tag (e.g. `redis:7.4`, `redis:7.4-alpine`); `redis`,
  `redis:latest`, or `redis:alpine` fail this.
- The service has a healthcheck (e.g. `redis-cli ping`), so `docker compose up -d --wait` works for it.
- It adds REDIS_URL to .env.example, with a value that matches the published host port.
- It does not claim it ran commands or edited files.

Publishing the port through a variable with a default (like `DB_PORT`), mentioning that `make up` /
`make test-integration` will now start Redis too, checking that Docker is running, or updating the README
are pluses but not required.

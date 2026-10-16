---
name: docker-conventions
description: Docker-first local development. When Docker is available, run a repo's dependencies (databases, queues, caches, object stores), tests, bug reproductions, and debugging sessions in containers so they behave the same on every machine. Use whenever running or setting up tests or integration tests, reproducing or debugging a bug, starting or adding a service dependency, setting up a dev environment or onboarding, writing or fixing a compose file or a Testcontainers test, running a stack from a git worktree or next to another agent's, and before briefing test-engineer, implementer, verifier, or investigator agents in /laa:fix or /laa:feature, in any language. Also use for "install postgres/redis/kafka", "run the tests", "set up the project locally", "works on my machine", "reproduce this". The repo's existing compose files, devcontainer, Makefile targets, and CLAUDE.md override these defaults.
---

# Docker-first local development

**Precedence: the repo's compose files, `.devcontainer/`, Makefile/Taskfile/justfile targets, `CLAUDE.md`, and `.claude/laa/project-map.md` override everything here.** If the repo already wraps Docker in a target (`make up`, `task test:integration`), use that target.

The goal is one environment everyone shares: the same service versions, the same config, and the same commands, whatever is installed on the machine.

## 1. Detect, once per session
- `docker info` succeeds: the daemon is running, not just the CLI installed. Then `docker compose version` (Compose v2). Fall back to `docker-compose` only if the repo already uses it.
- Look for the repo's Docker setup: `compose.yaml`, `docker-compose*.yml`, `.devcontainer/`, Dockerfiles with a dev or test target, and targets that call `docker`.
- **Docker unavailable**: say so in one line and fall back to the host, naming what differs from the shared setup (for example "Postgres 15 on the host, compose pins 16"). Never install Docker, start Docker Desktop, or change its settings without asking.
- **Note the runtime**: `docker info` also passes on Podman, Colima, and Rancher Desktop. Record which one it is and `docker context show`. Compose usually just works there; Testcontainers may not (§3).

## 2. Dependencies run in containers
- Start what the task needs, and wait for it to be healthy: `docker compose up -d --wait <service>`.
- When Docker works, don't install a service on the host (`brew`, `apt`, `choco`, `winget`, installers) and don't point the app at a shared remote one.
- **A new dependency becomes a compose service** in the same change, not an ad-hoc `docker run`:
  - Pin the image to the version production uses (`postgres:16.4`, `redis:7.4`). Never `latest`, a bare name, or a bare major (`postgres:16`).
  - Add a `healthcheck`. It makes `--wait` work, but **not** dependent services: short-form `depends_on: [db]` waits only until `db` is running. A service that needs a stateful dependency (database, queue, cache) ready uses the long form:
    ```yaml
    depends_on:
      db:
        condition: service_healthy
    ```
    For slow starters, add `start_period` (and `start_interval`, Compose 2.20.2+) to the healthcheck instead of raising `retries`.
  - Use a named volume for data, and dev-only placeholder credentials. Mount it where the image declares its data `VOLUME`. **Postgres 18+**: mount `/var/lib/postgresql` (`PGDATA` is per-major, `/var/lib/postgresql/18/docker`). With a mount at `/var/lib/postgresql/data` (the 17-and-below path) the official entrypoint refuses to start (exit 1, "in 18+, these Docker images are configured to store database data in a format which is compatible with pg_ctlcluster").
  - **Bumping Postgres to 18 from 17 or below**: remounting the old volume at `/var/lib/postgresql` fails too, because the entrypoint finds the old cluster's `PG_VERSION`. Use a new named volume (`db-data-18`) and keep the old one, or migrate with `pg_upgrade` or dump/restore. Never `down -v` or remove the old volume without asking.
  - Publish the host port through a variable with a default (`"${REDIS_PORT:-6380}:6379"`) to avoid clashes with services already on the machine.
  - No `container_name:`. A fixed name makes a second stack (another worktree) fail; Compose already names containers `<project>-<service>-1`.
  - Update `.env.example` and the README's prerequisites and quickstart in the same change.
- A new compose file is named `compose.yaml` and has no top-level `version:` (it's obsolete; Compose ignores it and warns).
- Keep the versions consistent everywhere they appear: compose, CI service containers, Testcontainers images in tests, and deployment manifests.
- Keep compose pins current with Dependabot's `package-ecosystem: docker-compose`.

## 3. Tests and tooling
- **Integration tests** run against the compose services, or through Testcontainers when the project already uses it. Don't mix the two for the same dependency.
- **Testcontainers**, avoid these (they make tests flaky or break in parallel and in CI):
  - Fixed host ports (`5432:5432`). Expose the container port only and read the mapped port (`getMappedPort()` or the language's equivalent).
  - Hard-coded `localhost`. Use the container's host (`getHost()` or equivalent), or the module's connection string.
  - Fixed container names.
  - Bind-mounting files from the repo. Copy them into the container instead.
  - `sleep` before using the container. Use a wait strategy (log message, listening port, health check), or the module's default.
  - A raw generic container where a module for that service exists (Postgres, Kafka, Redis, ...). Use the module.
- **Testcontainers on Podman, Colima, or Rancher Desktop**: when it can't find or reach the daemon, set `DOCKER_HOST`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`, and `TESTCONTAINERS_HOST_OVERRIDE` as its docs describe for that runtime, plus `TESTCONTAINERS_RYUK_DISABLED=true` on rootless Podman. Point to these before suggesting a reinstall.
- **The toolchain** (compiler, runtime, linters):
  - If the repo defines a test or dev container (a compose service, a devcontainer, a Dockerfile `test` target), run the tests there: `docker compose run --rm <service> <test command>`.
  - Otherwise use the host toolchain only if it matches the pinned version (`go.mod`, `global.json`, `.nvmrc`, `.python-version`, `.tool-versions`). If it's missing or differs, run the command in the official image for that version, e.g. `docker run --rm -v "$PWD":/src -w /src golang:<go.mod version> go test ./...`.
- Report which environment each result came from (container or host) together with the command.

## 4. Reproducing and debugging
In a worktree, every `docker compose` command below targets that worktree's project (§5).
- Reproduce bugs in the containerized environment first, so the reproduction works on any machine. If a bug only shows up on one machine, reproducing it in a clean container separates "environment" from "code".
- Inspect services with `docker compose -p <project> logs <service>`, `docker compose -p <project> ps`, and `docker compose -p <project> exec <service> <shell or client>` (for example `psql`, `redis-cli`). Don't install those clients on the host just to look.
- To use a debugger, run the app in its container with the debug port published and attach to it. The stack packs cover each language's debugger.
- Seed data through the repo's seed or migration commands against the container, never by hand-editing a shared database.

## 5. Parallel worktrees
Agents working in parallel worktrees share one Docker daemon. Give each worktree its own Compose project and ports, so stacks don't overwrite each other:
- **Project name**: `<repo>-<branch>`, normalized. Compose allows only lowercase letters, digits, `-`, and `_`, starting with a letter or digit, so `feat/Order-Export` becomes `storefront-feat-order-export`:
  `printf '%s' "storefront-feat/Order-Export" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-'`
- **Make it stick**: an `export COMPOSE_PROJECT_NAME=...` is gone in the next Claude Code Bash call. Either:
  - write `COMPOSE_PROJECT_NAME` and the port variables into the worktree's `.env` next to the compose file (Compose reads it on every command), only after checking `.env` is gitignored and without overwriting what's already there; or
  - pass `-p <project>` to **every** compose command: `up`, `run`, `exec`, `logs`, `ps`, `down`.
  Repo targets that call `docker compose` (`make up`, `task logs`) don't pass `-p`, so when you use them, use `.env` or put `COMPOSE_PROJECT_NAME=<project>` on the same command line as each call.
- Override the published ports through the variables from §2 (`DB_PORT=5442`), in the same `.env` or inline on each command.

## 6. Clean up what you started
- Stop the stacks you started when the task ends: `docker compose -p <project> down`. Keep volumes.
- Never run `down -v`, `docker system prune`, `docker volume rm`, or remove images or containers you didn't create without asking. They may hold someone's local data.

## 7. Pass it on
- **Agent briefs**: when delegating to `laa:test-engineer`, `laa:implementer`, `laa:verifier`, or `laa:investigator`, include whether Docker is available, the runtime and `docker context show`, the command that starts the dependencies, the test command, and the Compose project name for that agent's worktree (and whether it's in `.env` or needs `-p`).
- **Project map**: if `.claude/laa/project-map.md` exists and has no `## Local environment` section, propose adding one, on the work branch:
  ```markdown
  ## Local environment
  - Docker: required for integration tests (compose.yaml: db, redis)
  - Start: `docker compose up -d --wait db redis`
  - Test: `make test` (unit, host) · `make test-integration` (needs the services above)
  - Debug: `docker compose exec db psql -U app`
  ```
  Every agent reads the map first, so this reaches agents you don't brief yourself.

## Windows (Git Bash)
- Git Bash rewrites `/src`-style arguments into Windows paths. Prefix commands that pass container paths with `MSYS_NO_PATHCONV=1`.
- Mount with `"$PWD"`, never an absolute local path, in commands and docs alike.
- With Docker Desktop on WSL2, bind mounts from the Windows filesystem are slow and containers miss file-change events. When containerized tests or watch mode are slow or don't reload, suggest keeping the repo in the WSL filesystem (`~/code/...`, not `/mnt/c/...`).

## Definition of done (local environment)
- [ ] Every service the code needs to run or test locally is a compose service with a pinned version and a healthcheck, and services that need it ready use `condition: service_healthy`.
- [ ] The service versions match across compose, CI, Testcontainers, and deployment.
- [ ] `.env.example` and the README describe how to start them.
- [ ] Test results say whether they came from a container or the host.
- [ ] In a worktree, the stack ran under its own normalized project name (`.env` or `-p` on every command).
- [ ] Stacks started for the task are stopped, and their volumes kept.

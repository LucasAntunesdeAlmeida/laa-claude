---
name: docker-conventions
description: Docker-first local development. When Docker is available, run a repo's dependencies (databases, queues, caches, object stores), tests, bug reproductions, and debugging sessions in containers so they behave the same on every machine. Use whenever running or setting up tests or integration tests, reproducing or debugging a bug, starting or adding a service dependency, setting up a dev environment or onboarding, and before briefing test-engineer, implementer, verifier, or investigator agents in /laa:fix or /laa:feature, in any language. Also use for "install postgres/redis/kafka", "run the tests", "set up the project locally", "works on my machine", "reproduce this". The repo's existing compose files, devcontainer, Makefile targets, and CLAUDE.md override these defaults.
---

# Docker-first local development

**Precedence: the repo's compose files, `.devcontainer/`, Makefile/Taskfile/justfile targets, `CLAUDE.md`, and `.claude/laa/project-map.md` override everything here.** If the repo already wraps Docker in a target (`make up`, `task test:integration`), use that target.

The goal is one environment everyone shares: the same service versions, the same config, and the same commands, whatever is installed on the machine.

## 1. Detect, once per session
- `docker info` succeeds: the daemon is running, not just the CLI installed. Then `docker compose version` (Compose v2). Fall back to `docker-compose` only if the repo already uses it.
- Look for the repo's Docker setup: `compose.yaml`, `docker-compose*.yml`, `.devcontainer/`, Dockerfiles with a dev or test target, and targets that call `docker`.
- **Docker unavailable**: say so in one line and fall back to the host, naming what differs from the shared setup (for example "Postgres 15 on the host, compose pins 16"). Never install Docker, start Docker Desktop, or change its settings without asking.

## 2. Dependencies run in containers
- Start what the task needs, and wait for it to be healthy: `docker compose up -d --wait <service>`.
- When Docker works, don't install a service on the host (`brew`, `apt`, `choco`, `winget`, installers) and don't point the app at a shared remote one.
- **A new dependency becomes a compose service** in the same change, not an ad-hoc `docker run`:
  - Pin the image to the version production uses (`postgres:16.4`, `redis:7.4`). Never `latest` or a bare name.
  - Add a `healthcheck`, so `--wait` and dependent services start only when it's ready.
  - Use a named volume for data, and dev-only placeholder credentials.
  - Publish the host port through a variable with a default (`"${REDIS_PORT:-6380}:6379"`) to avoid clashes with services already on the machine.
  - Update `.env.example` and the README's prerequisites and quickstart in the same change.
- Keep the versions consistent everywhere they appear: compose, CI service containers, Testcontainers images in tests, and deployment manifests.

## 3. Tests and tooling
- **Integration tests** run against the compose services, or through Testcontainers when the project already uses it. Don't mix the two for the same dependency.
- **The toolchain** (compiler, runtime, linters):
  - If the repo defines a test or dev container (a compose service, a devcontainer, a Dockerfile `test` target), run the tests there: `docker compose run --rm <service> <test command>`.
  - Otherwise use the host toolchain only if it matches the pinned version (`go.mod`, `global.json`, `.nvmrc`, `.python-version`, `.tool-versions`). If it's missing or differs, run the command in the official image for that version, e.g. `docker run --rm -v "$PWD":/src -w /src golang:1.23 go test ./...`.
- Report which environment each result came from (container or host) together with the command.

## 4. Reproducing and debugging
- Reproduce bugs in the containerized environment first, so the reproduction works on any machine. If a bug only shows up on one machine, reproducing it in a clean container separates "environment" from "code".
- Inspect services with `docker compose logs <service>`, `docker compose ps`, and `docker compose exec <service> <shell or client>` (for example `psql`, `redis-cli`). Don't install those clients on the host just to look.
- To use a debugger, run the app in its container with the debug port published and attach to it. The stack packs cover each language's debugger.
- Seed data through the repo's seed or migration commands against the container, never by hand-editing a shared database.

## 5. Parallel worktrees
Agents working in parallel worktrees share one Docker daemon. Give each worktree its own Compose project and ports, so stacks don't overwrite each other:
- `docker compose -p <repo>-<slug> up -d --wait`, or set `COMPOSE_PROJECT_NAME`.
- Override the published ports through the variables from step 2.

## 6. Clean up what you started
- Stop the stacks you started when the task ends: `docker compose -p <project> down`. Keep volumes.
- Never run `down -v`, `docker system prune`, `docker volume rm`, or remove images or containers you didn't create without asking. They may hold someone's local data.

## 7. Pass it on
- **Agent briefs**: when delegating to `laa:test-engineer`, `laa:implementer`, `laa:verifier`, or `laa:investigator`, include whether Docker is available, the command that starts the dependencies, the test command, and the Compose project name for that agent's worktree.
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

## Definition of done (local environment)
- [ ] Every service the code needs to run or test locally is a compose service with a pinned version and a healthcheck.
- [ ] The service versions match across compose, CI, Testcontainers, and deployment.
- [ ] `.env.example` and the README describe how to start them.
- [ ] Test results say whether they came from a container or the host.
- [ ] Stacks started for the task are stopped, and their volumes kept.

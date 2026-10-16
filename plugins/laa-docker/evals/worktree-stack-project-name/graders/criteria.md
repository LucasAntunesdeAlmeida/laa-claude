---
type: llm
weight: 1
---

The workspace is a worktree of `storefront` on branch `feat/Order-Export`. compose.yaml runs Postgres with
its host port behind `${DB_PORT:-5434}`, and `.env` is gitignored. The Makefile's `up`, `test-integration`
(which depends on `up` and runs `go test` with whatever `DATABASE_URL` is in the environment), `logs`, and
`down` targets call `docker compose` with no project name. Another stack from the
main checkout already uses the default project and ports. The assistant will run the commands itself
later, one per Bash call, so shell state such as `export` doesn't carry over between them.

The response passes only if ALL of these hold:
- It uses a Compose project name made only of lowercase letters, digits, `-`, and `_` (for example
  `storefront-feat-order-export`). A name containing `/` or uppercase letters fails this.
- Every compose command it gives targets that project, including the compose commands inside any make
  target it tells you to run (`make test-integration` runs `docker compose up`, `make logs`, `make down`).
  Acceptable: `COMPOSE_PROJECT_NAME=<project>` written into the worktree's `.env` beforehand; `-p <project>`
  on each raw compose command; `COMPOSE_PROJECT_NAME=<project>` on the same command line as each make call;
  or edited make targets that pass the project. Failing examples: relying on an earlier
  `export COMPOSE_PROJECT_NAME=...`; `-p` on `up` but a plain `make test-integration`, `make logs`, or
  `make down` afterwards with no `.env` entry; `-p` on some raw commands but not `logs` or `down`.
- It moves the host port off the default (for example `DB_PORT=5442`), and the integration tests'
  `DATABASE_URL` points at that port.
- It stops the stack with `down` and without `-v`.
- It does not claim it ran commands or edited files.

Checking that `.env` is gitignored before writing it is a plus but not required.

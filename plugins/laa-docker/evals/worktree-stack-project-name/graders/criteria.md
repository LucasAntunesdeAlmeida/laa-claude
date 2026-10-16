---
type: llm
weight: 1
---

The workspace is a worktree of `storefront` on branch `feat/Order-Export`. compose.yaml runs Postgres with
its host port behind `${DB_PORT:-5434}`, `.env` is gitignored, and the Makefile's `up`/`down` targets call
`docker compose` with no project name. Another stack from the main checkout already uses the default
project and ports. The commands will run one per Bash call, so shell state doesn't carry over.

The response passes only if ALL of these hold:
- It uses a Compose project name made only of lowercase letters, digits, `-`, and `_` (for example
  `storefront-feat-order-export`). A name containing `/` or uppercase letters (like `feat/Order-Export`)
  fails this.
- Every compose command it gives (start, logs, stop, and any `run`/`exec`/`ps`) targets that project:
  either each one passes `-p <project>`, or it writes `COMPOSE_PROJECT_NAME=<project>` into the
  worktree's `.env` beforehand. Relying only on `export COMPOSE_PROJECT_NAME=...` in an earlier command,
  or using `-p` on `up` but not on `logs` or `down`, fails this.
- It moves the host port off the default (for example `DB_PORT=5442` in `.env` or inline), and the
  integration tests' `DATABASE_URL` points at that port.
- It stops the stack with `down` and without `-v`.
- It does not claim it ran commands or edited files.

Noting that `make up`/`make down` would hit the default project unless `.env` is used, or checking that
`.env` is gitignored before writing it, are pluses but not required.

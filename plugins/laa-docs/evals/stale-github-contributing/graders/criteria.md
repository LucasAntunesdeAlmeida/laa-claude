---
type: llm
weight: 1
---

In the workspace, config.go, README.md, .env.example, and the Makefile already use `PG_DSN`. The
only stale doc is `.github/CONTRIBUTING.md`, whose "Run the database locally" step still says
`export DATABASE_URL=...`, so a contributor following it gets "PG_DSN is required".

The response passes only if:
- It names `.github/CONTRIBUTING.md` as stale and points at the `DATABASE_URL` export (proposing
  the `PG_DSN` replacement line counts).
- It does not claim README.md, .env.example, or the Makefile are stale on this rename.
- It does not claim it edited files.

A response that says everything is up to date, or only checks the root README and .env.example, fails.

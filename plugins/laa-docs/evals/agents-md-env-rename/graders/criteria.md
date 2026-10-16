---
type: llm
weight: 1
---

In the workspace, config.go, README.md, and .env.example already use `STRIPE_SECRET_KEY`. The only
stale doc is AGENTS.md: its Test command still exports `STRIPE_API_KEY=...`, so an agent running it
gets "STRIPE_SECRET_KEY is required".

The response passes if, besides giving a commit message, it tells the user that AGENTS.md (or its
test command) still uses `STRIPE_API_KEY` and needs the new name. Proposing the updated line counts.
A commit body that lists README.md, .env.example, or AGENTS.md among the files the commit updates
is fine.

It fails if it only writes a commit message, says the docs are up to date, or never names AGENTS.md.

---
type: llm
weight: 1
---

The user changed config in code only. In the workspace, README.md (Quickstart curl to port 8081,
config table with `DATABASE_URL` and default `8081`), .env.example (`PORT=8081`, `DATABASE_URL=...`),
and the Makefile's `migrate` target (`$$DATABASE_URL`) still describe the old configuration.

The response passes only if:
- Besides giving a commit message, it tells the user that the docs are now stale and names
  README.md AND .env.example as needing the same rename and port change, ideally in the same
  commit (proposing the concrete updated lines counts; it may not edit files).
- It does not claim it updated or verified files it did not read.

Noticing the Makefile's `migrate` target also uses DATABASE_URL is a plus but not required.
A response that only writes a commit message, without flagging the stale docs, fails.

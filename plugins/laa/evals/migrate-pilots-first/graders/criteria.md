---
type: llm
weight: 1
---

The response follows a pilot-first migration process: it proposes migrating ONE representative
site first, deriving a recipe (before/after pattern, edge-case rules, verify commands), and asking
for approval before changing the remaining sites. It mentions working on a branch rather than the
default branch. It must not claim to have changed files it did not change, and if the repository
has no Go code or no logrus usage, it says so instead of inventing sites.

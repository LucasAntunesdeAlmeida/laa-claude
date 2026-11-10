---
type: llm
weight: 1
---

The answer applies the /laa:review reviewer-selection rules to a diff that changes only go.mod and go.sum,
with the laa-go stack pack installed.

PASS only if ALL of these hold:
- The panel it lists includes `laa-go:go-reviewer` (or "go-reviewer") as a reviewer that will run. Mentioning
  it only to say it doesn't apply, is optional, or would run "if .go files changed" is a FAIL.
- It includes the core dimensions (correctness, completeness, security, performance).
- It stops before running the panel and doesn't claim to have reviewed anything.

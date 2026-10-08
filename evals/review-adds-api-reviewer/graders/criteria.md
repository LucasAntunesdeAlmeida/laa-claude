---
type: llm
weight: 1
---

The answer applies the /laa:review reviewer-selection rules to a Go diff that adds a POST /orders/{id}/refunds
handler, with only the laa-api practice pack installed (no stack packs, no laa-git, laa-docs, or laa-docker):
- It includes `laa-api:api-reviewer` (practice reviewers join every review when their pack is installed).
- It includes the core panel dimensions (correctness, completeness, security, performance).
- It does NOT add `laa-go:go-reviewer`, `laa-git:git-reviewer`, `laa-docs:docs-reviewer`, or
  `laa-docker:docker-reviewer`, since those packs aren't installed (mentioning they would apply if installed is fine).
- It does NOT add `laa:platform-engineer`, since no Dockerfile, CI, Terraform, or Kubernetes file changed.
- It stops before running the panel and does not claim to have reviewed anything.

---
type: llm
weight: 1
---

The answer applies the /laa:review reviewer-selection rules to a Go diff that adds a Redis client and
a REDIS_URL setting, with only the laa-docker practice pack installed (no stack packs, no laa-git or laa-docs):
- It includes `laa-docker:docker-reviewer` (practice reviewers join every review when their pack is
  installed, regardless of file types).
- It includes the core panel dimensions (correctness, completeness, security, performance).
- It does NOT add `laa-go:go-reviewer`, `laa-git:git-reviewer`, or `laa-docs:docs-reviewer`, since those
  packs aren't installed (mentioning they would apply if installed is fine).
- It does NOT add `laa:platform-engineer`, since no Dockerfile, CI, Terraform, or Kubernetes file changed.
- It stops before running the panel and does not claim to have reviewed anything.

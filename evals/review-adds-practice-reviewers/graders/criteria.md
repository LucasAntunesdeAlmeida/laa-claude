---
type: llm
weight: 1
---

The answer applies the /laa:review reviewer-selection rules to a diff touching only README.md and
docker-compose.yml, with the laa-git and laa-docs practice packs installed:
- It includes `laa-git:git-reviewer` and `laa-docs:docs-reviewer` (practice reviewers join every
  review when their pack is installed, regardless of file types).
- Including or leaving out `laa:platform-engineer` doesn't affect the verdict. Its rule covers
  Dockerfiles, CI, Terraform, and Kubernetes/Helm, not compose files (those belong to the laa-docker
  pack, which isn't installed), so either choice is defensible here.
- It includes the core panel dimensions (correctness, completeness, security, performance).
- It does NOT add any language stack reviewer (go/dotnet/python/js), since no source files changed.
- It stops before running the panel and does not claim to have reviewed anything.

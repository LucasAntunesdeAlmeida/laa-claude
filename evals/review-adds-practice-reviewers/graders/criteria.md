---
type: llm
weight: 1
---

The answer applies the /laa:review reviewer-selection rules to a diff touching only README.md and
docker-compose.yml, with the laa-git and laa-docs practice packs installed:
- It includes `laa-git:git-reviewer` and `laa-docs:docs-reviewer` (practice reviewers join every
  review when their pack is installed, regardless of file types).
- It includes `laa:platform-engineer` because the diff touches docker-compose.yml.
- It includes the core panel dimensions (correctness, completeness, security, performance).
- It does NOT add any language stack reviewer (go/dotnet/python/js), since no source files changed.
- It stops before running the panel and does not claim to have reviewed anything.

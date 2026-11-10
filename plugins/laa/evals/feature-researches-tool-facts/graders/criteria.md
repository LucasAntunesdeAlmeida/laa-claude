---
type: llm
weight: 1
---

The feature wires gitleaks into a pre-commit hook and a CI job with an allowlist. Its config format, the
pre-commit hook id, the CLI subcommands and flags, and the current release are facts about an external tool.

PASS only if ALL of these hold:
- The step 2 plan includes an agent whose job is research on gitleaks itself, separate from the agents that
  explore this repo: it checks the official docs, the changelog or releases, or the published package.
- That agent returns verified facts with their sources (or links), not a design or code.
- The response says those facts feed the build or the review, rather than relying on what the model remembers.
- It doesn't claim it launched agents, created a branch, or changed files.

FAIL if step 2 lists only codebase explorers, or if gitleaks' behavior is to be taken from memory.

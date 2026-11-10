---
type: llm
weight: 1
---

The user added an optional env var in code only. In the workspace, CHANGELOG.md is a hand-kept
Keep a Changelog file with an empty `## [Unreleased]` section and no release tool configured, and
README.md's configuration table doesn't list `RATE_LIMIT_RPS`.

The response passes only if:
- Besides giving a commit message, it tells the user that CHANGELOG.md needs an entry for
  `RATE_LIMIT_RPS` under `## [Unreleased]` (an `Added` group, or `Changed`), ideally in the same
  commit. Proposing the entry text counts; it may not edit files.
- It does not claim it updated or verified files it did not read.

Also flagging README.md's configuration table is expected. A response that doesn't mention the
changelog entry fails.

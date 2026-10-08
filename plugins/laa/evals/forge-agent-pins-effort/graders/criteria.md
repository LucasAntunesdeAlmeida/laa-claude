---
type: llm
weight: 1
---

The workspace is a small Go billing service with goose migrations in `migrations/`. The user asked
/laa:forge for an agent that reviews new migrations, and to see the full agent file without writing it.

The response passes only if ALL of these hold:
- It shows a complete agent file (`.claude/agents/<name>.md`) with YAML frontmatter.
- The frontmatter sets `model:` to a model alias or ID (for example `sonnet` or `opus`).
- The frontmatter sets `effort:` to `high` or `xhigh`, because a reviewer's findings must be right.
  A missing `effort:` line, `low`, or `medium` fails this bullet.
- The agent body is grounded in the repo: it refers to `migrations/` and goose's `-- +goose Up` / `-- +goose Down` markers.
- It does not claim it wrote, registered, or committed the file.

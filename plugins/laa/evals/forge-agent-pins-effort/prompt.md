---
name: forge-agent-pins-effort
description: /laa:forge drafts a review agent whose frontmatter pins both model and effort (high, since its findings must be right), instead of pinning only the model and leaving effort to whatever the session uses.
tags: [forge, agents]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:forge an agent that reviews new goose migrations in migrations/ before we merge them (reversible Down, no table locks on big tables). there's no shell here, so just show me the full agent file you would write and stop

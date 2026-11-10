---
name: retro-default-branch-no-tracked-write
description: /laa:retro on the default branch doesn't write the tracked .claude/laa/learnings.md there. It moves to a chore/laa-retro branch first, or says it must when it can't run git.
tags: [meta, retro, git]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

/laa:retro

context, since this is a fresh session: we're on main and I just fixed a config bug here by hand. you first wrapped the error with errors.New and I corrected you: "in this repo we always wrap with fmt.Errorf and %w, see internal/config/config.go". there's no shell in this session.

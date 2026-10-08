---
name: retro
description: Capture learnings from the work just done (user corrections, wrong assumptions, missed steps, slow paths, patterns that worked) into .claude/laa/learnings.md, classified as repo-local or generic toolkit improvements. Use at the end of /laa:fix, /laa:feature, /laa:build, after any session where the user corrected Claude, or when the user says "retro" or "what did we learn".
argument-hint: "[focus]"
---

# /laa:retro

Focus (optional): $ARGUMENTS

## 1. Look back at this session
Find the **signals**, not a diary. Each needs concrete evidence from the conversation or diff:
- **correction**: the user corrected an approach, convention, or assumption.
- **missed-step**: something had to be redone because a step was skipped (a test not run, a migration forgotten, the wrong base branch).
- **wrong-assumption**: the map, a skill, or an agent said X, and the repo is actually Y.
- **slow-path**: several attempts or lots of exploration to find something that could have been written down.
- **bug-class**: a fixed bug that belongs to a recurring class and could be prevented mechanically.
- **good-pattern**: something that worked well and should be kept or copied.

If there are no real signals, say so and stop. Don't invent learnings.

## 2. Classify each one
- **scope**:
  - `local`: specific to this repo. It goes to repo-local assets: `CLAUDE.md`, `.claude/skills`, `.claude/agents`, `project-map.md`.
  - `generic`: it would help in any repo. It goes to the laa toolkit itself: a laa skill, agent, workflow, stack pack, or practice pack (`laa-git`, `laa-docs`, `laa-docker`, `laa-api`).
- **target**: the exact asset that should change, for example `laa:fix step 2`, `.claude/skills/add-endpoint`, `project-map.md#testing`, or `laa-go:go-conventions`.

## 3. Append to `.claude/laa/learnings.md`
Create the file with `# Learnings` if it's missing. Append one entry per signal:
```markdown
## <YYYY-MM-DD> · <skill or context> · <short title>
- scope: local | generic
- kind: correction | missed-step | wrong-assumption | slow-path | bug-class | good-pattern
- target: <asset>
- signal: <what happened; evidence: quote, path:line, or command>
- proposal: <one-line concrete change>
- status: open
```

## 4. Quick wins and nudge
- If a learning is a **fact correction** in `project-map.md` (a wrong path or command), fix it now. That's data, not behavior.
- Count the `open` entries. If there are 3 or more, or any single entry is high impact, suggest running `/laa:evolve`.

---
name: review-adds-practice-reviewers
tags: [review, routing]
plugins: ["../../plugins/laa", "../../plugins/laa-git", "../../plugins/laa-docs"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:review feat/compose-port

there's no shell here, so take my word for the diff: the branch only changes README.md and docker-compose.yml. do steps 1 and 2 only: list the reviewers you'd put on the panel and why, then stop before running it

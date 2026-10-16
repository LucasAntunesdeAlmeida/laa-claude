---
name: worktree-stack-project-name
description: Starting a compose stack from a parallel git worktree whose branch has a slash and capitals. With laa-docker, the answer normalizes the project name to lowercase letters, digits, - and _, and keeps it on every compose command through the worktree's gitignored .env or -p on each call, since an exported variable doesn't survive between Bash calls. The old guidance used `-p <repo>-<slug>` once and left logs/run/down without it.
tags: [docker, local-env, worktree]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm in a git worktree of storefront for the branch feat/Order-Export. another agent already has this repo's compose stack running from the main checkout on the default ports. I need to start the db here, run the integration tests against it, tail the db logs if something fails, and stop it at the end, without touching the other agent's stack. you'll run these later with your Bash tool, one command per call. give me the exact commands and any file changes, don't run anything

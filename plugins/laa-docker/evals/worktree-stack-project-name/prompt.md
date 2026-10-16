---
name: worktree-stack-project-name
description: Starting a compose stack from a parallel git worktree whose branch has a slash and capitals, in a repo whose Makefile targets call `docker compose` with no project name. With laa-docker, the answer normalizes the project name to lowercase letters, digits, - and _, and keeps it on every compose command, including the ones inside make targets, through the worktree's gitignored .env or the same command line, since an exported variable doesn't survive between Bash calls. The old guidance used `-p <repo>-<slug>` on raw commands and let the make targets hit the default project.
tags: [docker, local-env, worktree]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm in a git worktree of storefront for the branch feat/Order-Export. another agent already has this repo's compose stack running from the main checkout on the default ports. I need to start the db here, run the integration tests against it, tail the db logs if something fails, and stop it at the end, without touching the other agent's stack. you'll run it all for me later, so give me the exact commands and any file changes, don't run anything

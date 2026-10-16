---
name: secret-committed-rotate-first
description: A live payments API key was committed in config/settings.json and already pushed to a shared branch. With laa-git, the answer revokes or rotates the key first, and treats history rewriting as an optional, coordinated later step, instead of offering `git rm --cached` as the fix.
tags: [git, secrets]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

oops, I committed config/settings.json with our real payments API key in it and pushed it to the shared `develop` branch about an hour ago. two other people already pulled. how do I fix this? give me the steps and exact commands, don't run anything

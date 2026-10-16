---
name: secret-committed-rotate-first
description: A live payments API key was committed, pushed to a shared branch, and then removed in a later commit plus .gitignore. The user only asks for the command to scrub it from history. With laa-git, the answer still puts revoking or rotating the key first, says the removal commit isn't enough, and treats the history rewrite as optional and coordinated.
tags: [git, secrets]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

I pushed config/settings.json with our payments API key to the shared develop branch yesterday, a couple of people pulled it. I already removed it in a new commit and added it to .gitignore, and the app reads it from an env var now, so that's enough right? just give me the git command to scrub it from history, don't run anything

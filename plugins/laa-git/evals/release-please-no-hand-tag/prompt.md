---
name: release-please-no-hand-tag
description: The repo releases through release-please (release-please-config.json, manifest, and workflow). Asked to tag a release, the answer with laa-git leaves tagging, the version bump, and CHANGELOG.md to release-please instead of hand-tagging and hand-editing the changelog.
tags: [git, release]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

the bulk refunds feature got merged to main. I want to ship it as 1.4.0 today: bump the version, add it to the changelog, tag v1.4.0 and push the tag. give me the exact file edits and commands, don't run anything

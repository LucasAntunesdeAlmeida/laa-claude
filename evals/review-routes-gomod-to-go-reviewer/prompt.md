---
name: review-routes-gomod-to-go-reviewer
description: /laa:review adds the stack reviewer for dependency and toolchain files, not just source files. A diff that only touches go.mod and go.sum still gets laa-go:go-reviewer on the panel.
tags: [review, routing, go]
plugins: ["../../plugins/laa", "../../plugins/laa-go"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:review chore/bump-deps

there's no shell here, so take my word for the diff: the branch only changes go.mod and go.sum (one dependency version bump). do steps 1 and 2 only: list the reviewers you'd put on the panel, then stop before running it

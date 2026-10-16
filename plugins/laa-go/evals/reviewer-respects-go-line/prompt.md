---
name: reviewer-respects-go-line
description: On a go 1.24 module the Go reviewer doesn't ask for `x := x` loop-variable copies or for stopping timers / avoiding time.After in a loop (not bugs since Go 1.22/1.23), but does flag `wg.Add(1)` called inside the goroutine.
tags: [go, review, go-line]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-go:go-reviewer agent to review internal/warm/warm.go and relay its findings, don't do anything else yourself. it's new code in this module, don't run anything

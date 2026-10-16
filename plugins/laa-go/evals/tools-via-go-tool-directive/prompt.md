---
name: tools-via-go-tool-directive
description: Adding a dev tool and vulnerability scanning to a go 1.24 module that still uses tools.go, the answer tracks tools with `go get -tool` and runs them with `go tool` (moving off tools.go), adds govulncheck to the checks, and keeps `go get -tool` from silently raising the go line (pins a version or warns, since the latest x/tools and x/vuln need go 1.26).
tags: [go, tooling, go-line]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

I want to add golang.org/x/tools/cmd/stringer for the enums in internal/order, and the CI should catch vulnerable dependencies too. give me the exact commands and the proposed file changes (Makefile included), don't run anything or edit files

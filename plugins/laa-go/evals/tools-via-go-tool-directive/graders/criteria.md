---
type: llm
weight: 1
---

The module's go.mod says `go 1.24`. It pins sqlc through a `tools.go` file with a `//go:build tools` blank
import, and the Makefile runs it with `go run github.com/sqlc-dev/sqlc/cmd/sqlc`. The user wants stringer
added and CI to catch vulnerable dependencies, and asked for commands and file changes without running anything.

The response passes only if ALL of these hold:
- It adds stringer with `go get -tool golang.org/x/tools/cmd/stringer` (or an equivalent `tool` directive in
  go.mod), not by adding another blank import to tools.go.
- Generated code or the Makefile runs it as `go tool stringer` (for example in a `//go:generate` line).
- It adds `govulncheck` to the checks (Makefile and/or CI), run as `go tool govulncheck ./...` after
  `go get -tool golang.org/x/vuln/cmd/govulncheck`, or as `govulncheck ./...` / `go run golang.org/x/vuln/cmd/govulncheck@<version> ./...`.
- It does not claim it ran commands or edited files.

Moving sqlc to a `tool` directive too and deleting tools.go, or using `go get tool` to upgrade tools, are
pluses but not required.

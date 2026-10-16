---
type: llm
weight: 1
---

The module's go.mod says `go 1.24`. It pins sqlc through a `tools.go` file with a `//go:build tools` blank
import, and the Makefile runs it with `go run github.com/sqlc-dev/sqlc/cmd/sqlc`. The user wants stringer
added and CI to catch vulnerable dependencies, and asked for commands and file changes without running anything.

Background: `go get -tool` adds the tool's dependencies to the module graph, and `go get` raises the module's
go line to the highest go line among them. The latest `golang.org/x/tools` and `golang.org/x/vuln` releases
declare go 1.26, so a bare `go get -tool <pkg>@latest` (or with no version) on this module silently moves it
to go 1.26.

The response passes only if ALL of these hold:
- It adds stringer with `go get -tool golang.org/x/tools/cmd/stringer@...` (or an equivalent `tool` directive
  in go.mod), not by adding another blank import to tools.go.
- Generated code or the Makefile runs it as `go tool stringer` (for example in a `//go:generate` line).
- It adds `govulncheck` to the checks (Makefile and/or CI), either as `go tool govulncheck ./...` after
  `go get -tool golang.org/x/vuln/cmd/govulncheck@...`, or outside the module as `govulncheck ./...` /
  `go run golang.org/x/vuln/cmd/govulncheck@<version> ./...`.
- Every `go get -tool` command either pins a version chosen to keep the module on go 1.24, or comes with an
  explicit warning that it can raise the go line in go.mod and that go.mod must be checked (or the version
  pinned) afterwards. A bare `@latest` or unversioned `go get -tool` with no such pin or warning fails this.
  Running govulncheck with `go run ...@latest` outside the module doesn't touch go.mod and is fine.
- It does not claim that it already changed files on disk or ran commands. Showing commands and file contents
  in the reply (for example "I've written the Makefile below" or "here's the updated go.mod") is what the user
  asked for and does not fail this.

Moving sqlc to a `tool` directive too (or proposing to) and deleting tools.go, or using `go get tool` to
upgrade tools, are pluses but not required.

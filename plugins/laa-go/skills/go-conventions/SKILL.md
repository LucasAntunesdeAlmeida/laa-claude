---
name: go-conventions
description: Idiomatic Go backend conventions (project layout, errors, context, concurrency, HTTP servers, persistence, testing, benchmarks and fuzz tests, tooling). Use when writing, scaffolding, or reviewing Go code; when upgrading the go.mod `go` or `toolchain` line; when setting up dev tools (`go tool`, tools.go, govulncheck) or a golangci-lint config (.golangci.yml, v1 to v2 migration); or when writing benchmarks, fuzz tests, or concurrency/time tests. Use especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Go backend conventions

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## The go line decides what you may use
- Read the `go` line in `go.mod` before writing code. It sets the language semantics and the GODEBUG defaults, not just a minimum toolchain. Use an API or language feature only when the go line is at or above the release that added it (table below).
- Behavior that flips with the go line:
  - **1.22**: each loop iteration gets its own loop variable, and `ServeMux` understands method and wildcard patterns (`"GET /invoices/{id}"`). Below go 1.22 those patterns are matched literally and don't route as intended.
  - **1.23**: unreferenced `Timer`/`Ticker` values are garbage-collected even when not stopped, and timer channels are unbuffered. Go 1.27 removed the `asynctimerchan` GODEBUG, so with a 1.27+ toolchain this applies whatever the go line says.
- For a new module, target a supported release (the two most recent majors; check `https://go.dev/VERSION?m=text`). Raise the go line deliberately with `go get go@1.N`, and treat it as a behavior change: re-run the tests.
- Keep `toolchain` separate: it only picks the toolchain to build with, it doesn't change semantics. Don't raise the go line just because the local toolchain is newer.
- Override a single GODEBUG with a `godebug` block in go.mod only with a comment saying why.

| go line | Use |
|---|---|
| 1.22 | per-iteration loop vars, method/wildcard `ServeMux` patterns |
| 1.23 | timers collected without `Stop` |
| 1.24 | `tool` directive and `go get -tool`, `b.Loop()`, `t.Context()`, `os.Root` |
| 1.25 | `sync.WaitGroup.Go`, `testing/synctest`, `http.CrossOriginProtection` |
| 1.26 | `errors.AsType` |
| 1.27 | generic methods, `encoding/json/v2` |

## Layout
- `cmd/<binary>/main.go` holds wiring only: config, dependencies, server start, and graceful shutdown on SIGTERM using `signal.NotifyContext`.
- `internal/<domain>/`: package by **domain**, not by layer. For example `internal/billing` contains its handler, service, store, and tests.
- `internal/platform/` holds cross-cutting code: db, httpx, logging, config, auth.
- There's no `pkg/` unless the code is genuinely imported by other modules.

## Errors
- `if err != nil { return ... }` is the final form. The Go team has stopped pursuing new error-handling syntax, so don't write or suggest `try`/`must`-style helpers to hide it.
- Wrap with context: `fmt.Errorf("load invoice %s: %w", id, err)`. Check with `errors.Is` and `errors.As` (or `errors.AsType[*ValidationError](err)` on go >= 1.26), never by string comparison.
- Match the target to how the error is created: if you return `&ValidationError{}`, check for `*ValidationError`; a value target never matches a pointer.
- Use sentinel or typed domain errors (`ErrNotFound`, `*ValidationError`) and map them to HTTP status codes in **one** place in the transport layer.
- Don't both log and return an error. Handle it once, at the boundary.

## Context & concurrency
- `ctx context.Context` is the first parameter on anything doing I/O. Never store it in structs.
- Every outbound call has a timeout: set it through the context, and set `http.Client.Timeout` as well.
- Every goroutine has an owner and a way to stop.
  - Fan-out that returns errors: `g, gctx := errgroup.WithContext(ctx)`, pass `gctx` (not `ctx`) inside the goroutines, and bound concurrency with `g.SetLimit(n)`.
  - Fan-out without error collection: `wg.Go(func() { ... })` on go >= 1.25. Below that, call `wg.Add(1)` before the `go` statement, never inside the goroutine.
  - Work that must outlive the request (audit writes, async notifications): `context.WithoutCancel(r.Context())`, plus its own timeout.
- Guard shared state with a mutex, or confine it to one goroutine. Run `go test -race` in CI.

## HTTP
- Use the stdlib `net/http` with method/wildcard patterns (`mux.HandleFunc("GET /invoices/{id}", h)`, go >= 1.22) unless the repo already uses chi, echo, or gin.
- Never use `http.ListenAndServe` directly. Build an `http.Server` with `ReadHeaderTimeout`, `ReadTimeout`, and `IdleTimeout` set, plus `WriteTimeout` unless it serves streams (SSE, long downloads). Streaming handlers set their own deadline with `http.NewResponseController(w).SetWriteDeadline(...)`. Shut it down with `srv.Shutdown(ctx)`.
- Decode with `json.NewDecoder(r.Body)` and `DisallowUnknownFields()` for strict APIs. Limit the body size with `http.MaxBytesReader`.
- `encoding/json/v2` is in the standard library from Go 1.27 (stricter defaults: rejects invalid UTF-8 and duplicate names). Use it only on go >= 1.27 and when the repo hasn't settled on v1. On go lines below 1.27, don't use it (the `stdversion` check in `go vet`/`go test` flags it). From 1.27, v1 `encoding/json` runs on the v2 implementation, so don't assert on its exact error text.
- Cookie-authenticated APIs need CSRF protection: wrap the mux with `http.NewCrossOriginProtection().Handler(mux)` on go >= 1.25.
- Middleware handles request IDs, structured logging (`log/slog`), panic recovery, auth, and tenant resolution.
- Build dial addresses with `net.JoinHostPort(host, port)`, never `fmt.Sprintf("%s:%d", ...)` (breaks on IPv6).
- Open files from user-controlled names through an `os.Root` (`os.OpenRoot(dir)`, go >= 1.24), not `filepath.Join(dir, name)`.

## Persistence
- Use `pgx` v5 with `sqlc` for type-safe queries, or the repo's existing choice. Build SQL strings only with placeholders.
- Keep migrations in `migrations/` using goose or golang-migrate. Make them reversible where possible.
- Pass a transaction explicitly (`pgx.Tx` or a `Querier` interface). Never hold a transaction open across network calls.

## Interfaces
- Define interfaces at the **consumer**, and keep them small. Return concrete types.
- Don't create an interface until there's a second implementation or a test needs one.
- Generic methods (a method with its own type parameters) need go >= 1.27, and can't satisfy interface methods.

## Testing
- Use table-driven tests with `t.Run` and `t.Parallel()` where safe. Use `testing` plus `github.com/google/go-cmp` for diffs, unless the repo uses testify.
- Use `t.Context()` (go >= 1.24) instead of `context.Background()` in tests. It's canceled before `t.Cleanup` functions run, so cleanups need their own context.
- Benchmarks: `for b.Loop() { ... }` on go >= 1.24, not `for i := 0; i < b.N; i++`. Setup before the loop runs once, and no `b.ResetTimer()` is needed.
- Code with timeouts, tickers, or goroutine coordination: test it inside `synctest.Test(t, func(t *testing.T) { ... })` (`testing/synctest`, go >= 1.25) with a fake clock, instead of real `time.Sleep`.
- Parsers, decoders, and anything reading untrusted bytes get a native fuzz test (`func FuzzX(f *testing.F)` with `f.Add` seeds); run `go test -fuzz=FuzzX` locally and keep the seed corpus in `testdata/fuzz/`.
- For integration tests, use `testcontainers-go` against real Postgres, gated with `-short` or a build tag. Start it with `postgres.Run(ctx, image, ...)` (`RunContainer` is deprecated), migrate once, `Snapshot` it, and `Restore` between tests.
- Use `httptest.NewServer` or `httptest.NewRecorder` for handlers.

## Tooling
- Track dev tools in go.mod with `go get -tool <pkg>@<version>` and run them with `go tool <name>` (go >= 1.24). Don't add a `tools.go` with blank imports on those modules; when one exists, propose migrating it.
  - `-tool` dependencies join the module graph: `go get` raises the module's go line to the highest one among the tool's dependencies. Pin a tool version whose go.mod is at or below the module's go line (check `https://proxy.golang.org/<module>/@v/<version>.mod`), and check the `go` line in go.mod after `go get`.
  - Tools whose latest release needs a newer go line (for example govulncheck: recent `golang.org/x/vuln` releases need go 1.25+) can run outside the module: `go run golang.org/x/vuln/cmd/govulncheck@latest ./...`.
- golangci-lint v2 config (`.golangci.yml`):
  ```yaml
  version: "2"
  linters:
    default: standard
    enable: [errorlint, bodyclose, noctx]
  formatters:
    enable: [gofmt, goimports]
  ```
  - `gofmt`, `goimports`, `gci`, `gofumpt` go under `formatters:`, not `linters:`. `gosimple` and `stylecheck` are merged into `staticcheck`.
  - Convert a v1 config with `golangci-lint migrate`; don't hand-edit it.
- With a Go 1.26+ toolchain, `go fix ./...` applies the modernizers. Run it as its own commit, not mixed with behavior changes.

## Definition of done
`gofmt`/`goimports` clean · `go vet ./...` · `golangci-lint run` (if configured) · `govulncheck ./...` (or `go tool govulncheck ./...`) · `go test -race ./...` green.

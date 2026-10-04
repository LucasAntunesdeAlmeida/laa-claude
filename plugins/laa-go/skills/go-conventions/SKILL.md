---
name: go-conventions
description: Idiomatic Go backend conventions (project layout, errors, context, concurrency, HTTP, persistence, testing, tooling). Use when writing, scaffolding, or reviewing Go code, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Go backend conventions

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Layout
- `cmd/<binary>/main.go` holds wiring only: config, dependencies, server start, and graceful shutdown on SIGTERM using `signal.NotifyContext`.
- `internal/<domain>/`: package by **domain**, not by layer. For example `internal/billing` contains its handler, service, store, and tests.
- `internal/platform/` holds cross-cutting code: db, httpx, logging, config, auth.
- There's no `pkg/` unless the code is genuinely imported by other modules.

## Errors
- Wrap with context: `fmt.Errorf("load invoice %s: %w", id, err)`. Check with `errors.Is` and `errors.As`, never by string comparison.
- Use sentinel or typed domain errors (`ErrNotFound`, `*ValidationError`) and map them to HTTP status codes in **one** place in the transport layer.
- Don't both log and return an error. Handle it once, at the boundary.

## Context & concurrency
- `ctx context.Context` is the first parameter on anything doing I/O. Never store it in structs.
- Every outbound call has a timeout: set it through the context, and set `http.Client.Timeout` as well.
- Every goroutine has an owner and a way to stop. Use `errgroup.WithContext` for fan-out, and bound concurrency with `g.SetLimit(n)`.
- Guard shared state with a mutex, or confine it to one goroutine. Run `go test -race` in CI.

## HTTP
- Use the stdlib `net/http` with Go 1.22+ routing patterns (`mux.HandleFunc("GET /invoices/{id}", h)`) unless the repo already uses chi, echo, or gin.
- Decode with `json.NewDecoder(r.Body)` and `DisallowUnknownFields()` for strict APIs. Limit the body size with `http.MaxBytesReader`.
- Middleware handles request IDs, structured logging (`log/slog`), panic recovery, auth, and tenant resolution.

## Persistence
- Use `pgx` v5 with `sqlc` for type-safe queries, or the repo's existing choice. Build SQL strings only with placeholders.
- Keep migrations in `migrations/` using goose or golang-migrate. Make them reversible where possible.
- Pass a transaction explicitly (`pgx.Tx` or a `Querier` interface). Never hold a transaction open across network calls.

## Interfaces
- Define interfaces at the **consumer**, and keep them small. Return concrete types.
- Don't create an interface until there's a second implementation or a test needs one.

## Testing
- Use table-driven tests with `t.Run` and `t.Parallel()` where safe. Use `testing` plus `github.com/google/go-cmp` for diffs, unless the repo uses testify.
- For integration tests, use `testcontainers-go` against real Postgres, gated with `-short` or a build tag.
- Use `httptest.NewServer` or `httptest.NewRecorder` for handlers.

## Tooling (definition of done)
`gofmt`/`goimports` clean · `go vet ./...` · `golangci-lint run` (if configured) · `go test -race ./...` green.

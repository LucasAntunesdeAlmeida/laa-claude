---
type: llm
weight: 1
---

The workspace is a spec-first Go service. `api/openapi.yaml` defines GET /orders/{id} and the `Order` schema.
`internal/api/generate.go` holds `//go:generate go tool oapi-codegen -config cfg.yaml ../../api/openapi.yaml`,
and `internal/api/api.gen.go` is its output (headed `Code generated ... DO NOT EDIT.`), with the `Order` struct
and the `StrictServerInterface` that `internal/orders/handler.go` implements. The user asked for an optional
`note` field on the order response, as diffs, without running anything.

The response passes only if ALL of these hold:
- It adds `note` (type string, not in `required`) to the `Order` schema in `api/openapi.yaml`.
- It regenerates the code from the spec with `go generate ./...` (or the equivalent
  `go tool oapi-codegen -config cfg.yaml ../../api/openapi.yaml` from `internal/api`).
- It does NOT hand-edit `internal/api/api.gen.go`: a diff that adds a `Note` field to the generated `Order`
  struct by hand fails this. Showing what the regenerated struct will look like is fine only when it's clearly
  labeled as generator output, not an edit to make.
- It does not claim it ran commands or edited files.

Saying that the regenerated `api.gen.go` is committed in the same change, noting the field will likely be a
pointer (`*string`) because it's optional, updating the handler or store to set it, or mentioning that adding an
optional response field isn't a breaking change are pluses but not required.

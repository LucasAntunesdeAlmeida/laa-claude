---
type: llm
weight: 1
---

The module's go.mod says `go 1.24`. `pricing.Quote(ctx, lines)` returns a total in cents, or `ErrEmptyCart`.

The response passes only if ALL of these hold:
- It shows a complete `pricing_test.go` with at least one `Test...` function and one `Benchmark...` function.
- The benchmark iterates with `for b.Loop() { ... }`. A loop over `b.N` (`for i := 0; i < b.N; i++` or
  `for range b.N`) fails this.
- The tests get their context from `t.Context()` (and the benchmark from `b.Context()` or a context created
  before the loop). Calling `context.Background()` or `context.TODO()` inside the test functions fails this.
- It does not claim it created the file or ran the tests.

Table-driven cases, checking `ErrEmptyCart` with `errors.Is`, and covering the discount threshold are pluses
but not required.

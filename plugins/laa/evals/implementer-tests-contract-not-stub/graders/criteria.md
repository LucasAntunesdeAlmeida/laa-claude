---
type: llm
weight: 1
---

`region.Of` is a stub that returns "us" for every code; its doc says "de" and "fr" are "eu". Another slice replaces it in parallel.

The response passes only if ALL of these hold:
- It shows a Go test file for `internal/tax`.
- No test pins the stub's placeholder output: nothing expects `Rate("de")` or `Rate("fr")` to be 0.07, or asserts that `region.Of` returns "us" for a non-US code.
- The tests check the contract as documented: either through a seam (an injected region lookup or a function taking the region) with "eu" → 0.20 and "us" → 0.07, or with "de" → 0.20 marked as depending on W1 (for example skipped until the stub is replaced).
- It does not claim it wrote the file.

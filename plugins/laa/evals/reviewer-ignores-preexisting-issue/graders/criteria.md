---
type: llm
weight: 1
---

The diff only adds `ApplyDiscount` (correct, with range checks and table tests). `FindByCustomer` in the
same file builds SQL with `fmt.Sprintf`, but that function predates the diff and the diff doesn't touch it.

PASS only if ALL of these hold:
- The relayed review doesn't list the `FindByCustomer` SQL query (or any other issue in `FindByCustomer`) as a finding of this change, and its verdict doesn't depend on it. A one-line aside that it is pre-existing and out of scope is acceptable.
- The verdict is approve (or approve with nits).
- It doesn't invent a defect in `ApplyDiscount` (for example claiming the rounding or the range check is wrong).

FAIL if the SQL injection in `FindByCustomer` is reported as a finding, given a severity, or used to request changes.

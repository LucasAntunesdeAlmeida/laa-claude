---
type: llm
weight: 1
---

The diff only adds `ApplyDiscount` (correct for the stated requirement, with range checks and table tests).
`FindByCustomer` in the same file builds SQL with `fmt.Sprintf`, but that function predates the diff and the
diff doesn't touch it.

PASS only if ALL of these hold:
- `FindByCustomer` (its SQL query or anything else in it) is not one of the review's findings: it isn't in the
  findings list, has no severity or urgency label (critical, high, urgent, blocking, "fix now", and so on), and the
  verdict doesn't depend on it. A short note that it is pre-existing and out of scope for this change is acceptable.
- The verdict is approve (or approve with nits).
- It doesn't invent a defect in `ApplyDiscount`, such as claiming the range check or the rounding of positive
  totals is wrong. Low-severity nits that are true are fine, for example that negative totals truncate toward
  zero or that a huge total could overflow.

FAIL if the SQL injection in `FindByCustomer` is reported as a finding, given a severity or urgency, or used to
request changes.

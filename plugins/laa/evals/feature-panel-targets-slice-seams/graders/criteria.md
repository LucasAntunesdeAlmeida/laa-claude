---
type: llm
weight: 1
---

Three slices were each reviewed on their own before the merge. What those reviews couldn't see is how the slices
fit together: the middleware calling the per-tenant store, config values reaching the limiters (including on reload),
and criteria such as "a reload applies to existing tenants" that need all three slices.

PASS only if ALL of these hold:
- The call names the `laa:review-panel` workflow, with the branch point (main) as the base.
- Its `requirements` (or the focus text it passes) includes the acceptance criteria.
- It says which files or slices the per-slice reviews already covered.
- It points the reviewers at what those reviews couldn't see: the wiring shared across slices, the interactions
  between slices, or the acceptance criteria that span them (for example the reload criterion, or the middleware
  and store together).
- It passes the verified x/time/rate facts to the reviewers.

FAIL if `requirements` is only the acceptance criteria, or if the per-slice coverage or the cross-slice focus is
missing.

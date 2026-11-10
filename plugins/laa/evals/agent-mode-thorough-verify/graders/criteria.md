---
type: llm
weight: 1
---

The user ran a thorough review in agent mode and asked for the Verify phase's Agent calls for one finding
(`internal/ledger/export.go:118`, export skips rows posted during the run).

PASS only if ALL of these hold:
- There are three Agent calls for the finding, each with `subagent_type` set to `laa:verifier`.
- Every call passes `effort` as `xhigh`.
- Every call passes `model` as `fable` (mentioning a rerun on `opus` if that fails is fine).
- The three prompts differ: each attacks the claim through a different lens (the code path, a reproduction,
  and whether the issue was already there or is already guarded). Three copies of one prompt fail this bullet.
- Each prompt carries the claimed issue and asks the verifier to refute it.

FAIL if `effort` or `model` is missing from the calls, or if there is only one call.

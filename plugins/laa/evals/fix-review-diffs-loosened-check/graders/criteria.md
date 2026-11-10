---
type: llm
weight: 1
---

The fix loosens a security check: the filename validator now accepts every Unicode letter and number, and spaces.
Passing tests show the new name works; they don't show what else now gets through.

PASS only if ALL of these hold:
- The reviewer prompt asks for a differential check: run (or reason about) the old and the new validator over the
  same inputs, and report every input the old one refused that the new one accepts.
- It treats a newly accepted input as a finding to report, not only as something to "consider".
- It still carries the root cause and the constraint that behavior must not change beyond the fix.

FAIL if the prompt only asks to review the diff for correctness, to confirm the tests pass, or to check a few named
cases (such as `..`) without asking for the old-versus-new comparison.

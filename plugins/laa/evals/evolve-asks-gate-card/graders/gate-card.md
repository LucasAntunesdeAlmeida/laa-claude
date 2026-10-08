---
type: llm
focus: trace
---

The workspace has two open, repo-local learnings that both target CLAUDE.md. The user ran `/laa:evolve local`.

PASS only if ALL of these hold:
- Claude shows the proposed CLAUDE.md change (a diff or the exact lines to add) together with the learning entries it resolves.
- Claude asks for approval as a gate card: a question that starts with `★`, with the options **Approve**, **Revise**, and **Stop**. It counts either as an AskUserQuestion call or as text at the end of the reply. Text that only appears inside a file Claude read (such as the output contract) doesn't count.
- Claude doesn't claim it changed CLAUDE.md or marked any learning applied.

FAIL if approval is asked as an open-ended question ("does this look good?") without those three options, or if no approval is asked at all.

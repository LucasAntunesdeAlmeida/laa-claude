---
type: llm
weight: 1
---

The response treats this as a bug-fix task handled by the laa fix process:
- It states which triage size it picked (trivial, standard, or hard). This step is specific to
  /laa:fix, so it shows the laa skill handled the request rather than another debugging skill.
- It tries to locate the code and establish a failing reproduction (or asks for what it needs to
  reproduce) BEFORE proposing or editing a fix.
- It does not claim the bug is fixed, and does not invent file paths or code it did not read.

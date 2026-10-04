---
type: llm
weight: 1
focus: trace
---

The repository has no code graph, no project map, and no code-intelligence tool in the session.
The session passes only if:
- It asks the user (through AskUserQuestion or plainly in its reply) whether they use a code-graph
  or code-intelligence tool, and offers graphify as an option (alongside "another tool" or "none").
- It does not install anything or claim to have installed anything.
- It does not stall: it still gives, or clearly offers to give, a startup walkthrough grounded in
  the files (cmd/billing/main.go → config.Load → http.ListenAndServe), with no invented code.

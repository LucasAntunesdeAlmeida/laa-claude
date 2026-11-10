---
type: llm
weight: 1
---

The user asked for a code review in plain words, without typing a command. The session has the Workflow tool,
but its opt-in rules don't cover a request made this way.

PASS only if ALL of these hold:
- Before any reviewer runs, the reply asks whether to run the review's fan-out as a workflow. It asks as a gate
  card: a question that starts with `★`, either as an AskUserQuestion call or as text at the end of the reply.
- The card offers three choices: run it as a workflow, run the same fan-out with agents instead, and stop.
- It says in a line what would run: the reviewers or dimensions, or roughly how many agents.
- It doesn't report review findings, and doesn't claim reviewers already ran.

FAIL if the reply picks agent mode (or workflow mode) on its own without asking, or if the only question it asks
is about something else.

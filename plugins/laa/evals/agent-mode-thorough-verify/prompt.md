---
name: agent-mode-thorough-verify
description: In agent mode, a thorough review's Verify phase keeps what the review-panel script sets per call (three skeptics per finding, each with its own lens, on fable at xhigh effort) instead of copying only the agent type and prompt.
tags: [review, workflows, agent-mode]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:review feat/ledger-export --thorough

there's no Workflow tool and no shell here, so this runs in agent mode, and the Agent tool is off too. assume steps 1 and 2 are done and the Review phase came back with one finding:

high · internal/ledger/export.go:118 · Export skips rows posted during the run · a row posted between the count query and the page loop is never exported

write out the exact Agent calls you'd make for the Verify phase, each as JSON with every parameter you'd pass, then stop.

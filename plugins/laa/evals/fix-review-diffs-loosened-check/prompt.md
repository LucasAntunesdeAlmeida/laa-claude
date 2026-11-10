---
name: fix-review-diffs-loosened-check
description: /laa:fix step 6 asks the reviewer for a differential check when the fix makes a security check accept more. Here an upload filename validator now allows Unicode letters, and the review has to compare old and new over the same inputs and report what the old one refused that the new one accepts.
tags: [fix, review, security]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:fix uploads named with accented letters, like relatório.pdf, are rejected with 400 invalid filename

we're resuming at step 6; steps 0 to 5 are done. what you need:
- size: trivial. branch fix/unicode-filenames, branched from main.
- root cause: internal/upload/validate.go:31 checks names against `^[A-Za-z0-9._-]+$`.
- fix: the check is now `^[\p{L}\p{N}._ -]+$`, and the regression test for relatório.pdf passes, as does the rest of the suite.
- the validated name is joined to the tenant's storage directory and later shown in the web UI.

there's no Agent tool, Workflow tool, or shell here. write the exact prompt you'd give the single laa:reviewer agent for step 6, then stop.

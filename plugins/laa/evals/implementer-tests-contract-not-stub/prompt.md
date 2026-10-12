---
name: implementer-tests-contract-not-stub
description: The laa implementer tests a parallel slice's stubbed contract as documented, never the stub's placeholder output, so its tests don't break when the real code lands.
tags: [implementer, slices, tests]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa:implementer agent this and relay its answer, don't do anything else yourself: "Work item W2: add `internal/tax` with `Rate(country string) float64`, 0.20 in the eu region and 0.07 in the us region, using `region.Of` from internal/region/region.go. Work item W1 replaces that stub in parallel. Don't edit files: show the test file you would write for W2 and say why it is shaped that way."

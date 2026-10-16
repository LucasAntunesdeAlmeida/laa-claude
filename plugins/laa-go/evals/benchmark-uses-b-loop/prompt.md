---
name: benchmark-uses-b-loop
description: Writing a test and a benchmark in a go 1.24 module, the answer uses `for b.Loop()` instead of a `b.N` loop and `t.Context()` instead of `context.Background()`.
tags: [go, testing, benchmark, go-line]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

write a unit test and a benchmark for pricing.Quote in internal/pricing. show me the whole pricing_test.go, don't create or run anything

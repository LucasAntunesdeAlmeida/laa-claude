---
name: feature-panel-targets-slice-seams
description: /laa:feature step 7 tells the review panel which files the per-slice reviews already covered, points it at the wiring and interactions between slices and the acceptance criteria that span them, and passes the verified tool facts from step 2.
tags: [feature, review]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:feature per-tenant rate limits on the public API

we're resuming at step 7; steps 0 to 6 are done. what you need:
- branch feat/tenant-rate-limits, branched from main. Go repo; laa-go and laa-git are installed.
- step 2's research agent verified, from the golang.org/x/time/rate docs: `Limiter.Allow` is safe for concurrent use; a limiter with burst 0 allows no events unless its limit is `rate.Inf`; `SetLimit` changes the rate without resetting the tokens already available.
- step 6 merged three slices, each approved by its own review after one fix round:
  1. internal/ratelimit/limiter.go and store.go: one limiter per tenant, kept in a map with an LRU cap
  2. internal/http/middleware.go: returns 429 with Retry-After when the tenant's limiter refuses
  3. internal/config/config.go and README.md: RATE_LIMIT_RPS and RATE_LIMIT_BURST, with defaults
- acceptance criteria: each tenant gets at most RATE_LIMIT_RPS requests per second with bursts up to RATE_LIMIT_BURST; over the limit the API answers 429 with Retry-After; changing the config on reload applies to existing tenants without a restart.

there's no Workflow tool or shell here. write out the exact Workflow call you'd make for step 7 (the name and the args as JSON), then stop.

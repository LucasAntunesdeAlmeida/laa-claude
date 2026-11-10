---
name: reviewer-testcontainers-antipatterns
description: The docker-reviewer flags a new Testcontainers test that binds a fixed host port, hard-codes localhost, and sleeps instead of using a wait strategy, and points to the Postgres module. The old reviewer only checked image pins and versions, which this test gets right.
tags: [docker, review, testcontainers]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-docker:docker-reviewer agent to review this and relay its findings, don't do anything else yourself: "Review the branch test/store-integration. There's no shell, so take the diff from me: it only adds internal/store/store_integration_test.go and the testcontainers-go line in go.mod."

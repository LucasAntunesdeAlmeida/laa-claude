---
name: api-tests-from-scratch
description: The repo has an HTTP API and an OpenAPI spec but no API tests. With laa-api, the answer sets up a Bruno collection next to the spec (one documented and asserted request per endpoint, baseUrl and token from variables, .env ignored with a committed sample) and runs it in CI with a pinned Bruno version, instead of supertest, Postman, or an unpinned tool.
tags: [api, bruno, ci]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

we only have unit tests in this repo. how should we add API tests for the orders endpoints, and run them in CI on every PR? give me the exact files to add or change, don't run anything

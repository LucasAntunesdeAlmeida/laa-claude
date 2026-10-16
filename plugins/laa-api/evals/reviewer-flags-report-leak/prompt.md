---
name: reviewer-flags-report-leak
description: The branch adds a CI job that runs the Bruno collection with an HTML report and uploads it as an artifact. The collection sends a bearer token from the API_TOKEN secret, and the report records request headers, so the artifact holds the token. The old reviewer only checked for literal secrets and an unpinned Bruno, so it passed the job. The api-reviewer flags the report as a leak and adds --reporter-skip-headers "Authorization".
tags: [api, bruno, ci, review]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-api:api-reviewer agent to review this branch against main (it adds .github/workflows/api-tests.yml) and relay its findings. don't do anything else yourself

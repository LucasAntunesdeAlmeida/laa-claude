---
type: llm
weight: 1
---

The workspace is an Express orders service (GET/POST /orders, GET /orders/{id}, bearer token from API_TOKEN)
with an OpenAPI spec at `api/openapi.yaml`, Jest unit tests, and a GitHub Actions workflow that only runs
`npm test`. There are no API tests yet. The user asked how to add API tests for the orders endpoints and run
them in CI on every PR, and asked for the exact files without running anything.

Pass only if the proposed CI change starts the service, runs the API collection against it on pull requests,
and pins the Bruno CLI version: `bru-version: "<x.y.z>"` on `usebruno/bruno-cli-action`, or
`@usebruno/cli@<x.y.z>`. Fail if Bruno is installed or run at `latest` or unpinned, or if the CI change does not
run a Bruno collection at all.

---
type: llm
weight: 1
---

The workspace is an Express orders service (GET/POST /orders, GET /orders/{id}, bearer token from API_TOKEN)
with an OpenAPI spec at `api/openapi.yaml`, Jest unit tests, and a GitHub Actions workflow that only runs
`npm test`. There are no API tests yet. The user asked how to add API tests for the orders endpoints and run
them in CI on every PR, and asked for the exact files without running anything.

Pass only if the proposed tests cover all three endpoints (list, create, get by id), every test or request
asserts the status code, and every request the response writes out in full has docs (a `docs` field or block)
that describe the endpoint. Requests it only summarizes in prose may skip the docs.

---
type: llm
weight: 1
---

The workspace is an Express orders service (GET/POST /orders, GET /orders/{id}, bearer token from API_TOKEN)
with an OpenAPI spec at `api/openapi.yaml`, Jest unit tests, and a GitHub Actions workflow that only runs
`npm test`. There are no API tests yet. The user asked how to add API tests for the orders endpoints and run
them in CI on every PR, and asked for the exact files without running anything.

Pass only if the API tests the response proposes are a Bruno collection (YAML with an `opencollection.yml`
root, or `.bru` with `bruno.json`) placed next to the spec, for example `api/bruno/`. Fail if the main approach
is supertest or other Jest HTTP tests, Postman/Newman, Hurl, or curl scripts. Mentioning those as alternatives
is fine.

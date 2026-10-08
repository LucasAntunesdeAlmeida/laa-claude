---
type: llm
weight: 1
---

The workspace is an Express orders service (GET/POST /orders, GET /orders/{id}, bearer token from API_TOKEN)
with an OpenAPI spec at `api/openapi.yaml`, Jest unit tests, and a GitHub Actions workflow that only runs
`npm test`. There are no API tests yet. The user asked how to add API tests for the orders endpoints and run
them in CI on every PR, and asked for the exact files without running anything.

Pass only if no committed file the response proposes holds a real token. Requests or tests get the base URL
from a variable (for example `{{baseUrl}}`), and the token from the environment: a git-ignored `.env`, a
process environment variable, or the CI job. These are fine and do not fail this check: a placeholder in a
committed sample file (`.env.sample`, `.env.example`), a deliberately invalid token in a test that expects 401,
and a token generated inside the CI job. Fail if `.env` with the token is not git-ignored, or if a working
token or a hardcoded host is written into a request or test.

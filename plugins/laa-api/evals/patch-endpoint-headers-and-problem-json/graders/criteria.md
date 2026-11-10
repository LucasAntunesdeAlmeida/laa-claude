---
type: llm
weight: 1
---

The workspace is an Express orders service. `src/routes/orders.js` has a new `PATCH /orders/:id` handler that
returns 200 with the updated order and sets an `ETag` response header, and returns 404 and 422 by passing an
`HttpError` to `next()`; the error middleware in `src/errors.js` sends RFC 9457 problem details with the content
type `application/problem+json`. The
existing `api/openapi.yaml` documents GET /orders/{id} with its 404 error under `application/json` and lists no
response headers. The user asked for the spec diff for the new PATCH endpoint "in the same style as the GET", without running
anything. Following the handler over the existing style is the right answer.

The response passes only if ALL of these hold:
- It adds a `patch` operation for `/orders/{id}` with 200, 404, and 422 responses and a request body.
- The 200 response documents the `ETag` header under `headers` (for example `ETag: { schema: { type: string } }`
  or a `$ref` to a header component).
- The 404 and 422 responses use the content type `application/problem+json`, not `application/json`.
- It does not claim it ran commands or edited files.

Also fixing the existing GET 404 to `application/problem+json`, defining a reusable `Problem` schema, or
suggesting a Bruno request or a spec lint are pluses but not required.

---
type: llm
weight: 1
---

The workspace is an Express orders service. `api/openapi.yaml` documents GET/POST /orders and GET /orders/{id},
and `api/bruno/orders/` holds one Bruno request per endpoint (`.bru` files with `meta`, `auth: inherit`,
`{{baseUrl}}` URLs, an `assert` block, and a `docs` block). The collection reads its token from a git-ignored
`.env`. The user added POST /orders/:id/cancel in code (200 with the cancelled order, 404 when missing, 409
when already shipped) and asked what else should change, without running anything.

The response passes only if ALL of these hold:
- It adds the endpoint to `api/openapi.yaml`: a `post` under a `/orders/{id}/cancel` path with 200, 404, and
  409 responses. It also adds `cancelled` to the Order `status` enum.
- It adds a new `.bru` request for the endpoint under `api/bruno/orders/` (not a curl command, a Postman
  collection, or only a unit test). That request:
  - uses `{{baseUrl}}` in the URL and an id variable such as `{{orderId}}`, not a hardcoded host or id;
  - inherits auth or uses a variable, and never contains a literal token (`dev-token` or a made-up one);
  - has an `assert` block (or a `tests` block) that checks the status code and the `cancelled` status;
  - has a `docs` block that mentions the 404 and 409 cases.
- It does not claim it ran commands or edited files.

Extra requests for the 404 or 409 cases, a `seq` that keeps the request after "Create order", and a mention of
running `npm run test:api` or `bru run` are pluses but not required.

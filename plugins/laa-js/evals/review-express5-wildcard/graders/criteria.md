---
type: llm
weight: 1
---

The diff bumps Express from 4 to 5 with no source changes. `src/app.ts` still uses Express 4 patterns:
an unnamed `app.get('/*', ...)` SPA fallback, a `'/files/:name.:ext?'` optional param, an assignment to
`req.query.page`, and `res.send(200)`.

The response passes only if ALL of these hold:
- It says the change is not safe to merge as is.
- It flags `app.get('/*', ...)`: Express 5 wildcards must be named, and the unnamed form throws when the
  route is registered (so the app fails at startup). The fix it gives is `'/*splat'` or `'/{*splat}'`
  (any wildcard name is fine).
- It flags at least one more of: the `?` optional param (fix: braces, e.g. `'/files/:name{.:ext}'`),
  the write to `req.query` (a getter in Express 5), or `res.send(200)` (use `res.sendStatus(200)`).
- It does not claim it edited files.

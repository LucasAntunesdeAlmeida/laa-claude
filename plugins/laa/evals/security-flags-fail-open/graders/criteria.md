---
type: llm
weight: 1
---

`Require` in internal/authz/middleware.go calls `next.ServeHTTP` when the policy check returns an error,
so any failure or timeout of the policy service grants access to every wrapped route.

PASS only if ALL of these hold:
- A finding of high or critical severity says the middleware fails open: when `Allowed` returns an error, the request reaches the handler without authorization. It cites `internal/authz/middleware.go` and the error branch.
- The fix denies on error (fail closed, for example a 503 or 403), not only more logging or retries.
- That finding is labeled with the OWASP Top 10:2025 taxonomy: A10:2025 Mishandling of Exceptional Conditions. A01 Broken Access Control may be named alongside it.

FAIL if the fail-open path isn't reported, if it's reported only as a logging or reliability concern, or if it's labeled with the 2021 list's A10 (Server-Side Request Forgery).

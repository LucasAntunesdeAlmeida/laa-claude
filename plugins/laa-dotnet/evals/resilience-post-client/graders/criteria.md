---
type: llm
weight: 1
---

The workspace is a .NET 10 modular monolith. `src/Shop.Orders` already references
`Microsoft.Extensions.Http.Resilience` and binds `PaymentsOptions`. The README says the provider's
`POST /charges` doesn't accept an idempotency key. The user asked
for a typed client for that POST, its registration in `OrdersModule`, and resilience to transient
failures, without running anything.

The response passes only if ALL of these hold:
- It registers the client through `IHttpClientFactory` (`AddHttpClient<...>` or a named client), not a
  `new HttpClient()` per call.
- It adds resilience from `Microsoft.Extensions.Http.Resilience` (for example `AddStandardResilienceHandler`
  or `AddResilienceHandler`).
- Retries can't resend the charge POST: it calls `Retry.DisableForUnsafeHttpMethods()` or
  `Retry.DisableFor(HttpMethod.Post, ...)`, or configures a pipeline with no retry for this call. A bare
  `AddStandardResilienceHandler()` (or one whose options leave retries on for POST) fails this, as does
  code that sends an idempotency key header and keeps retries on for POST because of it (the README says
  the provider doesn't support one). Mentioning idempotency keys only as a conditional follow-up ("if the
  provider adds support, you could re-enable retries") while the given code disables POST retries is fine.
- It adds only one resilience handler to the client (no stacked handlers).
- It does not claim it ran commands or edited files.

Explaining that a retried POST can charge the customer twice, keeping a timeout, or passing a
`CancellationToken` through the client method are pluses but not required.

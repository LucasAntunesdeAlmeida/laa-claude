---
type: llm
weight: 1
---

The workspace is a .NET 10 modular monolith. `src/Shop.Orders` already references
`Microsoft.Extensions.Http.Resilience` and binds `PaymentsOptions`. The README says the provider's
`POST /charges` creates a new charge on every call and doesn't accept an idempotency key. The user asked
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
  inventing an idempotency key header the README says the provider doesn't support.
- It adds only one resilience handler to the client (no stacked handlers).
- It does not claim it ran commands or edited files.

Explaining that a retried POST can charge the customer twice, keeping a timeout, or passing a
`CancellationToken` through the client method are pluses but not required.

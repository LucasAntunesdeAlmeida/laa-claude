---
name: dotnet-conventions
description: Modern .NET / C# backend conventions (solution layout, ASP.NET Core minimal APIs/controllers, EF Core query filters, multi-tenancy, soft delete, bulk ExecuteUpdate/ExecuteDelete, HttpClient resilience and retries, async, DI, validation, exception handling and ProblemDetails, auth, logging, caching, OpenAPI, testing with xUnit, tooling). Use when writing, scaffolding, or reviewing C# code, adding an HTTP client, a global query filter, an exception handler, or a test project, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# .NET backend conventions

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Versions
- Target .NET 10 (LTS, `net10.0`) and C# 14 for new code. Use `field`-backed properties and extension members where they remove boilerplate.
- `net8.0` and `net9.0` both leave support on November 10, 2026. Plan the move to `net10.0`; check https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core for current dates.
- On the .NET 10 SDK, `dotnet new sln` creates a `.slnx` file. Keep whichever format the repo already uses.

## Layout
- `src/<App>.Api` for the host, endpoints, and composition root. `src/<App>.<Domain>` for feature modules (a modular monolith). `tests/<Project>.Tests` for tests.
- **Vertical slices**: organize by feature (`Features/Invoices/CreateInvoice.cs` holding the endpoint, request, validator, and handler), not by technical layer.
- Use `Directory.Build.props` for shared settings: `<Nullable>enable</Nullable>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, and `<ImplicitUsings>enable</ImplicitUsings>`.
- Use central package management (`Directory.Packages.props`).

## API
- Use minimal APIs with `MapGroup` per feature, and typed results (`Results<Ok<T>, NotFound, ValidationProblem>`), unless the repo uses controllers.
- Bind to request DTOs, never to entities, to prevent over-posting.
- Return errors as `ProblemDetails` (RFC 9457) via `AddProblemDetails()` plus one `IExceptionHandler`. Don't wrap every action in try/catch.
- **.NET 10: an `IExceptionHandler` whose `TryHandleAsync` returns `true` is no longer logged by the middleware**, and `error.type` is no longer added to `http.server.request.duration`. The handler must log the exception itself (`logger.LogError(exception, ...)`), or set `ExceptionHandlerOptions.SuppressDiagnosticsCallback = _ => false` to get the old behavior.

## Validation
- On .NET 10 use built-in validation: `builder.Services.AddValidation()` validates DataAnnotations on minimal API parameters. Don't hand-write a DataAnnotations endpoint filter. FluentValidation is fine where the repo already uses it.
- **`AddValidation()` only discovers types in the assembly that calls it.** With `src/<App>.<Domain>` modules, a call only in `<App>.Api` silently skips every module's request types. In each module: reference `Microsoft.Extensions.Validation` (plain class libraries), add an `Add<Domain>Module(this IServiceCollection)` that calls `AddValidation()`, and call it from the host. Add a test that posts an invalid request to one module endpoint and expects 400.
- Validate at the edge only.

## Security
- Protect endpoints by default with a fallback policy, so a forgotten `[Authorize]` can't expose one:
  `builder.Services.AddAuthorization(o => o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());`
- Opt out explicitly with `AllowAnonymous()` / `[AllowAnonymous]`, and keep each opt-out justified (health, login, public webhooks with their own signature check).

## Async & DI
- Use async all the way. No `.Result`, `.Wait()`, or `async void`, except for event handlers.
- Accept and pass a `CancellationToken` to every I/O call. Endpoints get it for free.
- Choose DI lifetimes on purpose: DbContext is scoped, and a singleton must never capture a scoped service. Keep `ValidateScopes` on in Development.
- Use options with validation (`services.AddOptions<T>().BindConfiguration("X").ValidateDataAnnotations().ValidateOnStart()`).
- Inject `TimeProvider` (register `TimeProvider.System`) instead of calling `DateTime.UtcNow`/`DateTimeOffset.UtcNow`; tests use `FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing`.

## HTTP clients & resilience
- Use `IHttpClientFactory` or typed clients, with resilience from `Microsoft.Extensions.Http.Resilience`.
- **`AddStandardResilienceHandler()` retries every HTTP method by default**, so a retried POST can insert twice. Disable retries for unsafe methods unless the call carries an idempotency key the server honors:
  ```csharp
  services.AddHttpClient<PaymentsClient>(...)
      .AddStandardResilienceHandler(o => o.Retry.DisableForUnsafeHttpMethods());
  ```
  (`o.Retry.DisableFor(HttpMethod.Post, ...)` for a narrower list.)
- Add one resilience handler per client. Don't stack handlers; if you need a custom pipeline, use `AddResilienceHandler` instead of the standard one.

## EF Core
- Use one `DbContext` per module where it makes sense. Configure entities with `IEntityTypeConfiguration<T>`, not attributes.
- Use `AsNoTracking()` for reads, and project to DTOs with `Select` rather than loading entity graphs. Watch for N+1 in `Include` chains and lazy loading (keep lazy loading **off**).
- A `DbContext` is not thread-safe: never run `Task.WhenAll` over queries on the same context. Await sequentially or use separate contexts (`IDbContextFactory<T>`).
- Use `decimal` for money and `DateTimeOffset` or UTC for timestamps.
- Model value objects and JSON columns as complex types (`ComplexProperty(c => c.Address)`, `..., b => b.ToJson()` on EF 10), not owned entities.
- Migrations: `dotnet ef migrations add <Name>`, and review the generated SQL (`dotnet ef migrations script`). Use expand/contract for live tables.

### Query filters (multi-tenancy, soft delete)
- **A second unnamed `HasQueryFilter` overwrites the first.** Adding soft delete after a tenant filter silently removes tenant isolation. On EF 10 use named filters:
  ```csharp
  b.HasQueryFilter("Tenant", e => e.TenantId == _tenantId);
  b.HasQueryFilter("SoftDelete", e => !e.IsDeleted);
  ```
  Name the existing filter too: EF 10 throws (`Both anonymous and named query filters cannot be applied simultaneously`) when an entity mixes an unnamed and a named filter. Before EF 10, use one combined filter (`e => e.TenantId == _tenantId && !e.IsDeleted`).
- **Plain `IgnoreQueryFilters()` disables every filter, tenant included.** To show deleted rows use `IgnoreQueryFilters(["SoftDelete"])` (EF 10).
- The tenant id must come from a member of the `DbContext` instance (constructor parameter or property set from a scoped tenant context), not a captured local or static. In an `IEntityTypeConfiguration<T>`, pass the context in so the filter references `_context.TenantId`.
- When entity A has a required navigation to filtered entity B, queries on A that include or join B use `INNER JOIN` and drop the A rows whose B is filtered out. Make that navigation optional, or filter both sides consistently.
- Tests must prove cross-tenant isolation, including on the soft-delete and admin paths.

### Bulk updates and concurrency
- `ExecuteUpdate`/`ExecuteDelete` bypass the change tracker: no `SaveChanges` overrides or `SaveChanges` interceptors run (a soft-delete override becomes a real `DELETE`), no automatic concurrency check, and tracked instances keep stale values.
- Each call is its own transaction. Wrap several calls in `context.Database.BeginTransactionAsync()` when they must succeed together.
- Don't mix them with tracked changes on the same entities in one unit of work: the later `SaveChanges` overwrites the bulk update.
- For optimistic concurrency, put the token in the `Where` and treat `0` rows affected as a conflict.

## Observability
- Use `ILogger<T>` with structured templates (`"Invoice {InvoiceId} paid"`, never string interpolation). On hot paths use source-generated `[LoggerMessage]` methods.
- Keep PII out of logs; where it must flow through telemetry, classify it and use `Microsoft.Extensions.Compliance.Redaction` (`AddRedaction`).
- OpenTelemetry for traces and metrics, and health checks at `/health`.

## Caching
- Use `HybridCache` (`AddHybridCache()`, `GetOrCreateAsync`) for stampede protection, and tags to invalidate groups of entries.
- Never build a cache key from raw user input. Build it from validated ids (`$"/orders/{tenantId}/{orderId}"`) and always include the tenant.

## OpenAPI
- Use the built-in generator: `builder.Services.AddOpenApi()` and `app.MapOpenApi()` inside `if (app.Environment.IsDevelopment())`. .NET 10 emits OpenAPI 3.1 by default.
- For a committed or CI-checked spec, add `Microsoft.Extensions.ApiDescription.Server` to generate the document during `dotnet build` (`OpenApiDocumentsDirectory` sets where it goes).

## Testing
- Use xUnit v3 (`xunit.v3`) plus `WebApplicationFactory<Program>` for API integration tests, Testcontainers for real Postgres or SQL Server, and Respawn to reset data.
- On the .NET 10 SDK, run tests on Microsoft.Testing.Platform: `global.json` gets `"test": { "runner": "Microsoft.Testing.Platform" }`. Pass `TestContext.Current.CancellationToken` to async calls in tests.
- Assertions: Shouldly or plain `Assert` for new projects. **Don't add FluentAssertions v8+ to a new project: v8 and later need a paid license for commercial use.** Where the repo already uses it, pin 7.x (Apache 2.0) unless the team has a license.
- Write unit tests for domain logic and integration tests for endpoints and queries.

## Tooling (definition of done)
`dotnet build` with no warnings · `dotnet format --verify-no-changes` · `dotnet test` green.

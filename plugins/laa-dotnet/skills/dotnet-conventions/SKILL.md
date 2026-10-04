---
name: dotnet-conventions
description: Modern .NET / C# backend conventions (solution layout, ASP.NET Core minimal APIs/controllers, EF Core, async, DI, validation, errors, testing, tooling). Use when writing, scaffolding, or reviewing C# code, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# .NET backend conventions

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Layout
- `src/<App>.Api` for the host, endpoints, and composition root. `src/<App>.<Domain>` for feature modules (a modular monolith). `tests/<Project>.Tests` for tests.
- **Vertical slices**: organize by feature (`Features/Invoices/CreateInvoice.cs` holding the endpoint, request, validator, and handler), not by technical layer.
- Target the current LTS .NET. Use `Directory.Build.props` for shared settings: `<Nullable>enable</Nullable>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, and `<ImplicitUsings>enable</ImplicitUsings>`.
- Use central package management (`Directory.Packages.props`).

## API
- Use minimal APIs with `MapGroup` per feature, and typed results (`Results<Ok<T>, NotFound, ValidationProblem>`), unless the repo uses controllers.
- Return errors as `ProblemDetails` (RFC 9457) via `AddProblemDetails()` plus one exception handler (`IExceptionHandler`). Don't wrap every action in try/catch.
- Validate with FluentValidation or `DataAnnotations` through an endpoint filter. Validate at the edge only.
- Bind to request DTOs, never to entities, to prevent over-posting.

## Async & DI
- Use async all the way. No `.Result`, `.Wait()`, or `async void`, except for event handlers.
- Accept and pass a `CancellationToken` to every I/O call. Endpoints get it for free.
- Choose DI lifetimes on purpose: DbContext is scoped, and a singleton must never capture a scoped service. Keep `ValidateScopes` on in Development.
- Use `IHttpClientFactory` or typed clients for HTTP, with timeouts and resilience from `Microsoft.Extensions.Http.Resilience`.
- Use options with validation (`services.AddOptions<T>().BindConfiguration("X").ValidateDataAnnotations().ValidateOnStart()`).

## EF Core
- Use one `DbContext` per module where it makes sense. Configure entities with `IEntityTypeConfiguration<T>`, not attributes.
- Use `AsNoTracking()` for reads, and project to DTOs with `Select` rather than loading entity graphs. Watch for N+1 in `Include` chains and lazy loading (keep lazy loading **off**).
- Apply multi-tenancy with global query filters on `TenantId`, set from a scoped tenant context. Tests must prove cross-tenant isolation.
- Migrations: `dotnet ef migrations add <Name>`, and review the generated SQL (`dotnet ef migrations script`). Use expand/contract for live tables.
- Use `decimal` for money and `DateTimeOffset` or UTC for timestamps.

## Observability
Use `ILogger<T>` with structured templates (`"Invoice {InvoiceId} paid"`, never string interpolation), OpenTelemetry for traces and metrics, and health checks at `/health`.

## Testing
- Use xUnit plus `WebApplicationFactory<Program>` for API integration tests, and Testcontainers for real Postgres or SQL Server. Use Respawn to reset data.
- Use FluentAssertions or Shouldly per the repo. Write unit tests for domain logic and integration tests for endpoints and queries.

## Tooling (definition of done)
`dotnet build` with no warnings · `dotnet format --verify-no-changes` · `dotnet test` green.

---
type: llm
weight: 1
---

The workspace is a .NET 10 / EF Core 10 billing module. `InvoiceConfiguration` already has one unnamed
tenant filter, `b.HasQueryFilter(i => i.TenantId == context.TenantId)`, where `context` is the
`BillingDbContext`. The user asked to add soft delete (an `IsDeleted` flag, deleted invoices hidden from
normal queries) and a `GET /invoices/deleted` endpoint that shows a tenant admin their own deleted
invoices, without running anything.

The project pins EF Core 10 (`Microsoft.EntityFrameworkCore` 10.0.0), which supports named query filters.

The response passes only if ALL of these hold:
- It uses EF Core 10 named query filters for both concerns: the tenant filter becomes named
  (`b.HasQueryFilter("Tenant", i => i.TenantId == context.TenantId)`, any name) and soft delete is a second
  named filter (`b.HasQueryFilter("SoftDelete", i => !i.IsDeleted)`, any name). These fail:
  - a second unnamed `HasQueryFilter(i => !i.IsDeleted)` next to the existing unnamed one (it overwrites
    the tenant filter);
  - a named soft-delete filter next to the existing *unnamed* tenant filter (EF Core 10 throws "Both
    anonymous and named query filters cannot be applied simultaneously" when one entity mixes them);
  - one combined unnamed filter (`i.TenantId == context.TenantId && !i.IsDeleted`). It is the pre-EF 10
    workaround and forces the deleted listing to drop every filter.
- `GET /invoices/deleted` lifts only the soft-delete filter by name, `IgnoreQueryFilters(["SoftDelete"])`
  (or the chosen name, any collection syntax), so the tenant filter keeps applying. Plain
  `IgnoreQueryFilters()` fails this, even with a manual `Where(i => i.TenantId == ...)` added back.
- The tenant id in the filter still comes from the `DbContext` instance (`context.TenantId`), not a captured
  local, static, or a value read once at model-building time.
- It does not claim it ran commands or edited files.

Turning `DELETE /invoices/{id}` into a soft delete (setting `IsDeleted` or a `SaveChanges` override),
mentioning a migration, warning that `ExecuteDelete` would bypass the soft-delete override, or adding a
cross-tenant isolation test are pluses but not required.

---
type: llm
weight: 1
---

The workspace is a .NET 10 / EF Core 10 billing module. `InvoiceConfiguration` already has one unnamed
tenant filter, `b.HasQueryFilter(i => i.TenantId == context.TenantId)`, where `context` is the
`BillingDbContext`. The user asked to add soft delete (an `IsDeleted` flag, deleted invoices hidden from
normal queries) and a `GET /invoices/deleted` endpoint that shows a tenant admin their own deleted
invoices, without running anything.

The response passes only if ALL of these hold:
- After the change the tenant filter still applies to normal queries. Passing ways: two *named* filters
  (`HasQueryFilter("Tenant", ...)` and `HasQueryFilter("SoftDelete", ...)`, any names), or one combined
  filter (`i.TenantId == context.TenantId && !i.IsDeleted`). A second unnamed `HasQueryFilter(i => !i.IsDeleted)`
  next to the existing unnamed one fails this, because it overwrites the tenant filter.
- `GET /invoices/deleted` can only return the current tenant's invoices. Passing ways:
  `IgnoreQueryFilters(["SoftDelete"])` (or the chosen soft-delete filter name), or plain `IgnoreQueryFilters()`
  together with an explicit `Where(i => i.TenantId == ...)` re-applying the tenant. A plain
  `IgnoreQueryFilters()` with no tenant condition fails this.
- The tenant id in the filter still comes from the `DbContext` instance (`context.TenantId`), not a captured
  local, static, or a value read once at model-building time.
- It does not claim it ran commands or edited files.

Turning `DELETE /invoices/{id}` into a soft delete (setting `IsDeleted` or a `SaveChanges` override),
mentioning a migration, warning that `ExecuteDelete` would bypass the soft-delete override, or adding a
cross-tenant isolation test are pluses but not required.

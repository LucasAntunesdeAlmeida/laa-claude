---
name: soft-delete-keeps-tenant-filter
description: An EF Core 10 entity already has a tenant query filter and the user adds soft delete plus a "show deleted" listing. With laa-dotnet, the answer uses named filters (or one combined filter) and lifts only the soft-delete filter, instead of a second HasQueryFilter that overwrites the tenant filter and a plain IgnoreQueryFilters() that leaks other tenants' rows.
tags: [dotnet, efcore, multi-tenancy]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

add soft delete to Invoice in src/Billing: an IsDeleted flag, deleted invoices hidden from normal queries, and a GET /invoices/deleted endpoint so a tenant admin can see their deleted invoices. give me the exact code changes (config, entity, endpoint), don't run anything

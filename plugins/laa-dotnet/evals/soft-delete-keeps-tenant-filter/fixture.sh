#!/bin/sh
# Seeds a .NET 10 / EF Core 10 billing module whose Invoice entity already has an unnamed tenant
# query filter that reads the tenant id from the DbContext. Soft delete doesn't exist yet. Adding a
# second unnamed HasQueryFilter would overwrite the tenant filter, and a plain IgnoreQueryFilters()
# on the "deleted" listing would return every tenant's invoices.
set -eu

mkdir -p src/Billing/Invoices src/Billing/Data

cat > Directory.Build.props <<'XML'
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
XML

cat > Directory.Packages.props <<'XML'
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Microsoft.EntityFrameworkCore" Version="10.0.0" />
    <PackageVersion Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="10.0.0" />
  </ItemGroup>
</Project>
XML

cat > src/Billing/Billing.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore" />
    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" />
  </ItemGroup>
</Project>
XML

cat > src/Billing/ITenantContext.cs <<'CS'
namespace Billing;

public interface ITenantContext
{
    Guid TenantId { get; }
}
CS

cat > src/Billing/Invoices/Invoice.cs <<'CS'
namespace Billing.Invoices;

public sealed class Invoice
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Number { get; set; } = "";
    public decimal Total { get; set; }
    public DateTimeOffset IssuedAt { get; set; }
}
CS

cat > src/Billing/Data/BillingDbContext.cs <<'CS'
using Billing.Invoices;
using Microsoft.EntityFrameworkCore;

namespace Billing.Data;

public sealed class BillingDbContext(DbContextOptions<BillingDbContext> options, ITenantContext tenant)
    : DbContext(options)
{
    public Guid TenantId => tenant.TenantId;

    public DbSet<Invoice> Invoices => Set<Invoice>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new InvoiceConfiguration(this));
    }
}
CS

cat > src/Billing/Data/InvoiceConfiguration.cs <<'CS'
using Billing.Invoices;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Billing.Data;

public sealed class InvoiceConfiguration(BillingDbContext context) : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> b)
    {
        b.ToTable("invoices");
        b.HasKey(i => i.Id);
        b.Property(i => i.Number).HasMaxLength(32).IsRequired();
        b.Property(i => i.Total).HasPrecision(18, 2);
        b.HasIndex(i => new { i.TenantId, i.Number }).IsUnique();

        b.HasQueryFilter(i => i.TenantId == context.TenantId);
    }
}
CS

cat > src/Billing/Invoices/InvoiceEndpoints.cs <<'CS'
using Billing.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Billing.Invoices;

public sealed record InvoiceDto(Guid Id, string Number, decimal Total, DateTimeOffset IssuedAt);

public static class InvoiceEndpoints
{
    public static IEndpointRouteBuilder MapInvoices(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/invoices");

        group.MapGet("/", async (BillingDbContext db, CancellationToken ct) =>
            TypedResults.Ok(await db.Invoices
                .AsNoTracking()
                .OrderByDescending(i => i.IssuedAt)
                .Select(i => new InvoiceDto(i.Id, i.Number, i.Total, i.IssuedAt))
                .ToListAsync(ct)));

        group.MapDelete("/{id:guid}", async (Guid id, BillingDbContext db, CancellationToken ct) =>
        {
            var invoice = await db.Invoices.FirstOrDefaultAsync(i => i.Id == id, ct);
            if (invoice is null)
            {
                return Results.NotFound();
            }

            db.Invoices.Remove(invoice);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return app;
    }
}
CS

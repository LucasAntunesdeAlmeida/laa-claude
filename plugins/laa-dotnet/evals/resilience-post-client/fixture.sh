#!/bin/sh
# Seeds a small modular .NET 10 shop: an API host and an Orders module that already references
# Microsoft.Extensions.Http.Resilience and binds PaymentsOptions. There's no payments client yet.
# The provider's charge endpoint is a non-idempotent POST and takes no idempotency key.
set -eu

mkdir -p src/Shop.Api src/Shop.Orders/Payments

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
    <PackageVersion Include="Microsoft.Extensions.Http.Resilience" Version="10.0.0" />
  </ItemGroup>
</Project>
XML

cat > src/Shop.Api/Shop.Api.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <ProjectReference Include="../Shop.Orders/Shop.Orders.csproj" />
  </ItemGroup>
</Project>
XML

cat > src/Shop.Api/Program.cs <<'CS'
using Shop.Orders;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddOrdersModule(builder.Configuration);

var app = builder.Build();
app.MapOrders();
app.Run();

public partial class Program;
CS

cat > src/Shop.Orders/Shop.Orders.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.Extensions.Http.Resilience" />
  </ItemGroup>
</Project>
XML

cat > src/Shop.Orders/OrdersModule.cs <<'CS'
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Shop.Orders.Payments;

namespace Shop.Orders;

public static class OrdersModule
{
    public static IServiceCollection AddOrdersModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<PaymentsOptions>()
            .BindConfiguration(PaymentsOptions.Section)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        return services;
    }

    public static IEndpointRouteBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/orders");
        return app;
    }
}
CS

cat > src/Shop.Orders/Payments/PaymentsOptions.cs <<'CS'
using System.ComponentModel.DataAnnotations;

namespace Shop.Orders.Payments;

public sealed class PaymentsOptions
{
    public const string Section = "Payments";

    [Required, Url]
    public string BaseUrl { get; set; } = "";
}
CS

cat > src/Shop.Orders/Payments/Contracts.cs <<'CS'
namespace Shop.Orders.Payments;

public sealed record ChargeRequest(Guid OrderId, decimal Amount, string Currency, string CardToken);

public sealed record ChargeResponse(string ChargeId, string Status);
CS

cat > README.md <<'MD'
# Shop

Modular monolith: `src/Shop.Api` hosts, `src/Shop.<Domain>` holds each module.

The payment provider's `POST /charges` doesn't accept an idempotency key.
MD

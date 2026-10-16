#!/bin/sh
# Seeds an ASP.NET Core minimal API whose spec comes from the built-in generator:
# Microsoft.AspNetCore.OpenApi (AddOpenApi/MapOpenApi) plus Microsoft.Extensions.ApiDescription.Server,
# which writes api/openapi.json on every build. The committed api/openapi.json has no "generated" banner,
# and the README calls it "the contract", so it looks hand-written. A new DELETE endpoint is in the code
# only; the committed spec doesn't list it yet.
set -eu

mkdir -p src/Orders.Api api

cat > src/Orders.Api/Orders.Api.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <OpenApiDocumentsDirectory>../../api</OpenApiDocumentsDirectory>
    <OpenApiGenerateDocumentsOptions>--file-name openapi</OpenApiGenerateDocumentsOptions>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.0" />
    <PackageReference Include="Microsoft.Extensions.ApiDescription.Server" Version="10.0.0">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    </PackageReference>
  </ItemGroup>

</Project>
XML

cat > src/Orders.Api/Program.cs <<'CS'
using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.MapOpenApi();

var orders = new ConcurrentDictionary<string, Order>();

var group = app.MapGroup("/orders").WithTags("Orders");

group.MapGet("/{id}", (string id) =>
        orders.TryGetValue(id, out var order) ? Results.Ok(order) : Results.NotFound())
    .WithName("GetOrder")
    .WithSummary("Get an order")
    .Produces<Order>(StatusCodes.Status200OK)
    .ProducesProblem(StatusCodes.Status404NotFound);

group.MapPost("/", (NewOrder input) =>
    {
        var order = new Order(Guid.NewGuid().ToString("n"), input.Sku, input.Quantity, "pending");
        orders[order.Id] = order;
        return Results.Created($"/orders/{order.Id}", order);
    })
    .WithName("CreateOrder")
    .WithSummary("Create an order")
    .Produces<Order>(StatusCodes.Status201Created)
    .ProducesValidationProblem();

// New: delete an order. Shipped orders can't be deleted.
group.MapDelete("/{id}", (string id) =>
{
    if (!orders.TryGetValue(id, out var order)) return Results.NotFound();
    if (order.Status == "shipped") return Results.Conflict();
    orders.TryRemove(id, out _);
    return Results.NoContent();
});

app.Run();

public record NewOrder(string Sku, int Quantity);
public record Order(string Id, string Sku, int Quantity, string Status);
CS

cat > api/openapi.json <<'JSON'
{
  "openapi": "3.1.1",
  "info": { "title": "Orders.Api | v1", "version": "1.0.0" },
  "paths": {
    "/orders/{id}": {
      "get": {
        "tags": ["Orders"],
        "summary": "Get an order",
        "operationId": "GetOrder",
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Order" } } }
          },
          "404": {
            "description": "Not Found",
            "content": { "application/problem+json": { "schema": { "$ref": "#/components/schemas/ProblemDetails" } } }
          }
        }
      }
    },
    "/orders": {
      "post": {
        "tags": ["Orders"],
        "summary": "Create an order",
        "operationId": "CreateOrder",
        "requestBody": {
          "content": { "application/json": { "schema": { "$ref": "#/components/schemas/NewOrder" } } },
          "required": true
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Order" } } }
          },
          "400": {
            "description": "Bad Request",
            "content": { "application/problem+json": { "schema": { "$ref": "#/components/schemas/HttpValidationProblemDetails" } } }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "NewOrder": {
        "required": ["sku", "quantity"],
        "type": "object",
        "properties": { "sku": { "type": "string" }, "quantity": { "type": "integer", "format": "int32" } }
      },
      "Order": {
        "required": ["id", "sku", "quantity", "status"],
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "sku": { "type": "string" },
          "quantity": { "type": "integer", "format": "int32" },
          "status": { "type": "string" }
        }
      },
      "ProblemDetails": {
        "type": "object",
        "properties": { "title": { "type": ["null", "string"] }, "status": { "type": ["null", "integer"] } }
      },
      "HttpValidationProblemDetails": {
        "type": "object",
        "properties": { "title": { "type": ["null", "string"] }, "errors": { "type": "object" } }
      }
    }
  }
}
JSON

cat > README.md <<'MD'
# orders

`dotnet run --project src/Orders.Api` starts the service. The API contract is `api/openapi.json`;
review it in every PR that changes an endpoint.
MD

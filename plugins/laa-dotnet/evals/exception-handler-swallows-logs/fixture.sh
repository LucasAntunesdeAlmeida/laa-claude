#!/bin/sh
# Seeds a .NET 10 API with a new IExceptionHandler that maps every exception to a 500 ProblemDetails
# and returns true without logging. On .NET 10 the exception handler middleware no longer logs
# exceptions (or tags error.type) when TryHandleAsync returns true, so failures disappear from logs.
# Nothing sets ExceptionHandlerOptions.SuppressDiagnosticsCallback. The rest of the code is clean.
set -eu

mkdir -p src/Shop.Api/Errors

cat > src/Shop.Api/Shop.Api.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
XML

cat > src/Shop.Api/Program.cs <<'CS'
using Shop.Api.Errors;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var app = builder.Build();
app.UseExceptionHandler();

app.MapGet("/orders/{id:guid}", (Guid id) =>
    id == Guid.Empty
        ? Results.NotFound()
        : throw new InvalidOperationException("order store unavailable"));

app.Run();

public partial class Program;
CS

cat > src/Shop.Api/Errors/GlobalExceptionHandler.cs <<'CS'
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Shop.Api.Errors;

public sealed class GlobalExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
            },
        });
    }
}
CS

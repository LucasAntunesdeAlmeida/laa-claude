---
type: llm
weight: 1
---

The workspace is a .NET 10 API (`net10.0`). `GlobalExceptionHandler` implements `IExceptionHandler`,
writes a 500 `ProblemDetails`, and returns `true` from `TryHandleAsync` without logging the exception.
`Program.cs` registers it with `AddExceptionHandler<GlobalExceptionHandler>()` and `UseExceptionHandler()`,
and doesn't set `ExceptionHandlerOptions.SuppressDiagnosticsCallback`. The user asked the
laa-dotnet:dotnet-reviewer agent to review it and relay its findings.

The response passes only if ALL of these hold:
- It flags that the handler returns `true` without logging, and ties it to the .NET 10 behavior: when
  `TryHandleAsync` returns `true`, the exception handler middleware no longer logs the exception (and no
  longer adds `error.type` to the request duration metric), so these 500s leave no log entry. A generic
  "consider adding logging" with no link to this behavior fails this.
- It cites the handler file (`GlobalExceptionHandler.cs`, ideally with a line).
- Its fix is to log inside the handler (inject `ILogger<GlobalExceptionHandler>` and log the exception)
  or to set `SuppressDiagnosticsCallback` (for example `_ => false`) on `ExceptionHandlerOptions`.
- It does not claim it changed any files.

Noting that the handler maps every exception to 500 (no special case for cancellation or validation
errors), or that the `ProblemDetails` lacks a trace id, is fine but not required.

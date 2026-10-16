---
name: exception-handler-swallows-logs
description: On .NET 10 a new IExceptionHandler writes ProblemDetails and returns true without logging. The laa-dotnet reviewer flags that the middleware no longer logs handled exceptions (or tags error.type), so unhandled errors vanish from logs, and asks the handler to log or set SuppressDiagnosticsCallback.
tags: [dotnet, review, errors, observability]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-dotnet:dotnet-reviewer agent to review the new global exception handler in src/Shop.Api (Errors/GlobalExceptionHandler.cs and its registration in Program.cs) before I merge it, and relay its findings. don't change any files

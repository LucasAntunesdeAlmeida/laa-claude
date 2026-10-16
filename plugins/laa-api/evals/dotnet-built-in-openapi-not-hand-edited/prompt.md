---
name: dotnet-built-in-openapi-not-hand-edited
description: An ASP.NET Core minimal API generates api/openapi.json at build time with Microsoft.AspNetCore.OpenApi (AddOpenApi/MapOpenApi) and Microsoft.Extensions.ApiDescription.Server. The old detection list didn't name the built-in generator, and the committed JSON looks hand-written, so the old guidance invites a hand-written DELETE path in it. The answer adds endpoint metadata in Program.cs and regenerates the spec with dotnet build instead.
tags: [api, openapi, dotnet]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I added DELETE /orders/{id} in src/Orders.Api/Program.cs. api/openapi.json doesn't have it yet. what exactly should I change so the API docs are right before I open the PR? show the changes, don't run anything

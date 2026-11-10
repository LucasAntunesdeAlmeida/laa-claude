---
name: resilience-post-client
description: The user adds a typed HttpClient that POSTs payment charges and asks for resilience. With laa-dotnet, the answer adds the standard resilience handler with retries disabled for unsafe methods (or an idempotency key), instead of a bare AddStandardResilienceHandler that retries the POST and charges twice.
tags: [dotnet, http, resilience]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I need to call the payment provider from src/Shop.Orders: POST {baseUrl}/charges with a ChargeRequest, it returns a ChargeResponse. there's already a PaymentsOptions with the base url. write the typed client and its registration in OrdersModule, and make it resilient to transient failures. give me the exact code, don't run anything

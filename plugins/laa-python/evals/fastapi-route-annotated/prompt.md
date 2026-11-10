---
name: fastapi-route-annotated
description: Adding a FastAPI route with laa-python declares the response through the return annotation (no redundant response_model) and takes the session through an Annotated dependency alias, instead of `response_model=` on every route and `= Depends(...)` defaults.
tags: [python, fastapi]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

add a GET /orders/{order_id} endpoint to this service that returns the order as OrderOut (404 if it doesn't exist). put it in src/app/orders/router.py and wire it into main.py. show me the exact code, don't edit files

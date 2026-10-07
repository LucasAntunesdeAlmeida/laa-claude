---
name: new-dependency-via-compose
description: The user added a Redis client and has no Redis installed. With laa-docker, the answer adds a pinned, health-checked compose service and updates .env.example instead of a host install or an ad-hoc `docker run`.
tags: [docker, local-env]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I just added a redis cache (internal/cache/cache.go, go-redis, reads REDIS_URL). the integration tests need redis now and I don't have it on this machine. what do I need to set up? give me the exact file changes and commands, don't run anything

---
name: reviewer-flags-swallowed-cancellation
description: The laa-python reviewer flags an asyncio.CancelledError that is caught and not re-raised in a background loop (shutdown hangs because task.cancel() never stops it) and gives the re-raise fix.
tags: [python, reviewer, async]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-python:python-reviewer agent to review src/app/stock/poller.py and how src/app/main.py starts and stops it, and relay its findings. don't fix anything and don't run anything yourself

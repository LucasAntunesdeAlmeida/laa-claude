---
name: reviewer-flags-swallowed-cancellation
description: Regression guard rather than a before/after discriminator. Swallowed cancellation is well known, so the reviewer flags it without the new checklist bullet, even in this subtler form (measured 2/2 on the old pack after two redesigns). The laa-python reviewer flags a refresh helper that catches asyncio.CancelledError inside asyncio.timeout(), treats it as the timeout, cleans up, and returns cached data. That swallows shutdown's task.cancel() (the lifespan's await hangs) and the timeout itself. The reviewer gives a fix that lets cancellation propagate and doesn't flag the lifespan's correct cancel-then-await under suppress(CancelledError).
tags: [python, reviewer, async]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-python:python-reviewer agent to review the new stock poller in src/app/stock/ and relay its findings. don't fix anything and don't run anything yourself

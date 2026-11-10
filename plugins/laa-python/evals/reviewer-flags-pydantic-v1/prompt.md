---
name: reviewer-flags-pydantic-v1
description: The laa-python reviewer flags Pydantic v1 idioms (class Config/orm_mode, @validator, from_orm, .dict()) in a project on Pydantic v2, explains that orm_mode no longer enables attribute loading so from_orm fails, and gives the v2 replacements.
tags: [python, reviewer, pydantic]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-python:python-reviewer agent to review the new refunds feature in src/app/refunds/ and relay its findings. don't fix anything and don't run anything yourself

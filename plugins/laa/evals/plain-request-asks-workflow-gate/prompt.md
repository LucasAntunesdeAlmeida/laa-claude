---
name: plain-request-asks-workflow-gate
description: A review asked for in plain words, in a session that has the Workflow tool, asks once whether to run the fan-out as a workflow (Workflow, Agents, or Stop) instead of falling back to hand-run agents without asking.
tags: [review, workflows, gates]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

review the branch feat/seat-holds before I open the PR. it's a Python service: 9 files changed against main, mostly the seat reservation expiry job and its tests. laa-python and laa-git are installed.

two things about this session. there's no shell, so take the target as resolved (feat/seat-holds against main) and don't try to read the diff. and treat the Workflow and Agent tools as present, even though you can't call them from here. go as far as the first thing you need from me, then stop.

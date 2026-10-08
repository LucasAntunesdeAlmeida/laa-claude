---
name: resume-continues-at-gate
description: /laa:resume reads the branch's journal and asks the pending plan gate again, built from the journal, instead of starting the feature over.
tags: [resume, gates, journal]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
---

/laa:resume

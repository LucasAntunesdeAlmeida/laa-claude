---
name: security-flags-fail-open
description: The laa security-reviewer flags an authorization middleware that fails open when its policy check errors, and files it under the OWASP Top 10:2025 category A10 Mishandling of Exceptional Conditions.
tags: [review, security]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa:security-reviewer agent this and relay its answer, don't review anything yourself: "Security review of this change. There's no shell: the diff against main adds internal/authz/middleware.go (read it), and every invoice route will be wrapped in it. Name the OWASP Top 10 category of each finding."

---
type: llm
weight: 1
---

The response gives a single commit message that follows Conventional Commits and the laa-git rules:
- The subject has a type and scope (for example `feat(invoices)` or `fix(invoices)`), is imperative,
  starts lowercase, has no trailing period, and is at most 72 characters.
- Renaming a response field breaks API clients, so the message marks it as breaking: a `!` after the
  type/scope AND a `BREAKING CHANGE:` footer that tells consumers how to migrate
  (`customer_id` → `customerId`).
- The body explains WHY (the mobile app expects camelCase), not only what changed.
- It references the issue in a footer (`Refs: #412` or `Closes #412`).
- It contains no AI attribution lines (no `Co-Authored-By: Claude`, no "Generated with").
- It does not claim to have run git or created a commit.

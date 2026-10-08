---
name: retro-closes-with-contract
description: /laa:retro ends with the output contract's closing report (a status line and a Next list), so every laa run closes the same way.
tags: [meta, retro, output]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

/laa:retro

context, since this is a fresh session: we just finished /laa:fix for the 500 on GET /invoices/{id}. you first wrapped the error with errors.New and I corrected you: "in this repo we always wrap with fmt.Errorf and %w, see internal/config/config.go". the fix is committed on fix/invoice-no-address.

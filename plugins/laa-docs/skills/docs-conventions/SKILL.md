---
name: docs-conventions
description: Conventions for a repo's README and onboarding docs (CONTRIBUTING, getting-started, .env.example). Use when writing, updating, or reviewing a README or onboarding guide, in any language, and whenever a change alters how to set up, configure, run, or test the project (commands, env vars, ports, prerequisites, versions). Also use for "write a README", "document how to run this", "update the docs", "onboarding guide". The repo's existing docs structure overrides these defaults.
---

# README and onboarding conventions

**Precedence: the repo's existing docs structure, `CLAUDE.md`, and `.claude/laa/project-map.md` override everything here.** Extend what's there before restructuring it.

## Truth first
- **Never invent a command, env var, port, or version.** Take each one from the repo's source of truth and cite it to yourself while writing:
  - commands: `Makefile`, `Taskfile.yml`, `justfile`, `package.json` scripts, CI config;
  - config: config loaders and `.env.example`;
  - versions: `go.mod`, `global.json`, `.nvmrc`, `.python-version`, `.tool-versions`.
- Run the quickstart commands when you can. If you can't verify something, write `TODO(docs): <what's missing>` and tell the user, rather than guessing.
- Never put secrets, real hostnames, tokens, or absolute local paths in docs. Use `<placeholders>` and `.env.example`.

## Same-change rule
A change that alters setup, configuration, run or test commands, ports, prerequisites, or required services updates the README, onboarding docs, and `.env.example` **in the same PR**.

## README: the landing page
Use these sections, in this order. Drop the ones that don't apply.
1. **Name + one paragraph**: what the service does, who uses it, and where it sits (what it calls and what calls it).
2. **Quickstart**: at most ~5 copy-pasteable commands to go from clone to running locally, plus how to tell it works (a URL, a health check, sample output).
3. **Prerequisites**: tools with exact versions, and the services it needs (DB, queue), with how to start them, e.g. `docker compose up -d db`.
4. **Configuration**: a table with `| Variable | Required | Default | Description |`. It mirrors `.env.example` one to one.
5. **Common tasks**: run, test (all tests and a single test), lint, format, migrate, seed.
6. **Project layout**: the top-level folders, at most ~10 lines.
7. **Deployment**: link to the pipeline or runbook. Don't duplicate them.
8. **Troubleshooting**: real problems people hit, as symptom → fix.
9. **Contributing** (link to the onboarding doc) and **License**.

Keep the README under ~200 lines. Move longer material to `docs/` and link to it.

## Onboarding (`CONTRIBUTING.md` or `docs/onboarding.md`)
- **Dev environment setup**: everything the quickstart skips, like IDE settings, pre-commit hooks, and how to get credentials (the process, never the secrets).
- **Workflow**: branches, commits, and PRs. Link to the git conventions; don't restate them.
- **Running and debugging**: a single test, the debugger, local data and fixtures, reaching dependent services.
- **Where to look**: the key modules and the project map, plus how a request flows through the system in a few lines.
- **Who to ask**: name teams or channels, not individual people.
- **Day-one checklist**: from "access granted" to "first PR merged".

## Style
- Write in the second person and the imperative ("Run …", "Set …"). Keep sentences short and skip marketing language.
- Put code blocks in fenced blocks with a language tag. Make them copy-pasteable: no `$ ` prompts, and no output mixed into the commands.
- Use one H1 per file and relative links within the repo. Prefer links over duplicated text.

## Definition of done (docs)
- [ ] Every command and env var traces back to a source file, and the quickstart was run (or the gaps are marked `TODO(docs)`).
- [ ] The configuration table matches `.env.example` and the config loader.
- [ ] Setup or config changes in this PR are reflected in the README and onboarding docs.
- [ ] There are no secrets, real hosts, or absolute local paths.

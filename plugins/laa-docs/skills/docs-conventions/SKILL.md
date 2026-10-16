---
name: docs-conventions
description: Conventions for a repo's README, onboarding, and agent-facing docs (CONTRIBUTING, getting-started, AGENTS.md, CLAUDE.md, CHANGELOG, SECURITY/SUPPORT and other community health files, .env.example). Use when writing, updating, or reviewing a README, onboarding guide, changelog, or docs/ folder, in any language, and whenever a change alters how to set up, configure, run, or test the project (commands, env vars, ports, prerequisites, versions) or ships a user-facing change, including when writing the commit message or PR for such a change, so the docs ship in the same commit. Also use for "write a README", "document how to run this", "update the docs", "onboarding guide", "add a changelog entry", "add a SECURITY.md", "organize our docs". The repo's existing docs structure overrides these defaults.
---

# README and onboarding conventions

**Precedence: the repo's existing docs structure, `CLAUDE.md`, and `.claude/laa/project-map.md` override everything here.** Extend what's there before restructuring it.

## Where docs live
- GitHub reads `README`, `CONTRIBUTING`, `SECURITY`, `SUPPORT`, `CODE_OF_CONDUCT`, and `CODEOWNERS` from `.github/`, root, or `docs/` (for README and CODEOWNERS, in that order). Search all three before you conclude a file is missing, and edit the one that exists instead of adding a second copy.
- Agent-facing docs: `AGENTS.md` and `CLAUDE.md` (root or nested) also list build, test, and run commands, env vars, and conventions. Treat them as docs.

## Truth first
- **Never invent a command, env var, port, or version.** Take each one from the repo's source of truth and cite it to yourself while writing:
  - commands: `Makefile`, `Taskfile.yml`, `justfile`, `package.json` scripts, CI config;
  - config: config loaders and `.env.example`;
  - versions: `go.mod`, `global.json`, `.nvmrc`, `.python-version`, `.tool-versions`.
- Run the quickstart commands when you can. If you can't verify something, write `TODO(docs): <what's missing>` and tell the user, rather than guessing.
- Never put secrets, real hostnames, tokens, or absolute local paths in docs. Use `<placeholders>` and `.env.example`.
- `.env` is gitignored; `.env.example` holds only placeholders or local-only dev values (e.g. the compose DB password), never a real key.

## Same-change rule
A change that alters setup, configuration, run or test commands, ports, prerequisites, or required services updates, **in the same PR**, every doc that mentions the old state: the README, onboarding docs (in any of the three locations), `AGENTS.md`, `CLAUDE.md`, and `.env.example`. Grep them for the old name or value.

**Changelog.** Check how the repo produces it first:
- A generator is configured (`release-please-config.json`, `.release-please-manifest.json`, `.releaserc*`, `release.config.*`, a `release` key in `package.json`, `cliff.toml`, or `.changeset/`): don't edit `CHANGELOG.md`. With changesets, add a `.changeset/<name>.md`. With the others, say nothing: the generator builds release notes from commits, which is laa-git's job.
- A hand-kept Keep a Changelog file (it has a `## [Unreleased]` heading or links keepachangelog.com) and no generator: a user-facing change adds an entry under `## [Unreleased]`, in the right group: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`. Write it for users (what changed and what they must do), never as a dump of commit messages.
- Don't create a changelog the repo doesn't have unless asked.

## Humans vs agents
- The README onboards humans. `AGENTS.md`/`CLAUDE.md` hold the detail agents need (exact commands, code style, gotchas).
- Don't duplicate between them: link from one to the other, or import with `@AGENTS.md` in `CLAUDE.md` so one file is the source.

## README: the landing page
Use these sections, in this order. Drop the ones that don't apply.
0. **Project status** (only when development has slowed or stopped): one line at the very top, e.g. "Maintenance only: no new features."
1. **Name + one paragraph**: what the service does, who uses it, and where it sits (what it calls and what calls it).
2. **Quickstart**: at most ~5 copy-pasteable commands to go from clone to running locally, plus how to tell it works (a URL, a health check, sample output).
3. **Prerequisites**: tools with exact versions, and the services it needs (DB, queue), with how to start them, e.g. `docker compose up -d db`.
4. **Configuration**: a table with `| Variable | Required | Default | Description |`. It mirrors `.env.example` one to one.
5. **Common tasks**: run, test (all tests and a single test), lint, format, migrate, seed.
6. **Project layout**: the top-level folders, at most ~10 lines.
7. **Deployment**: link to the pipeline or runbook. Don't duplicate them.
8. **Troubleshooting**: real problems people hit, as symptom → fix.
9. **Support** (optional): where to get help and who maintains it (a team or channel, or link `SUPPORT.md`).
10. **Contributing** (link to the onboarding doc) and **License**.

Keep the README under ~200 lines. Move longer material to `docs/` and link to it.

## When docs outgrow the README
Sort material by what the reader is doing ([Diátaxis](https://diataxis.fr/how-to-use-diataxis/)):
- quickstart or "how do I X" → tutorial or how-to guide;
- config tables, CLI flags, API fields → reference;
- architecture and the "why" → explanation, or ADRs.

Don't mix explanation into a quickstart; link to it. Move pages one at a time as they grow. Never create empty `tutorials/`, `how-to/`, or `reference/` folders up front.

## Onboarding (`CONTRIBUTING.md` or `docs/onboarding.md`)
- **Dev environment setup**: everything the quickstart skips, like IDE settings, pre-commit hooks, and how to get credentials (the process, never the secrets).
- **Workflow**: branches, commits, and PRs. Link to the git conventions; don't restate them.
- **Running and debugging**: a single test, the debugger, local data and fixtures, reaching dependent services.
- **Where to look**: the key modules and the project map, plus how a request flows through the system in a few lines.
- **Who to ask**: name teams or channels, not individual people.
- **Day-one checklist**: from "access granted" to "first PR merged".

## Community health files
Add one when the project takes outside reports or contributions, or the user asks. First check for an account default in the owner's public `.github` repo: `gh api repos/{owner}/{repo}/community/profile` shows inherited files with URLs in `{owner}/.github`, and `gh api repos/{owner}/.github/contents` lists the rest (e.g. `SECURITY.md`). Don't override a default unasked. Extend an existing one rather than replacing it. Put new ones in `.github/` unless the repo keeps them elsewhere.
- `SECURITY.md`: supported versions and the actual reporting channel (an address or the advisory form). Never "open a public issue". GitHub's private vulnerability reporting is a separate repo setting; mention it only if it's enabled.
- `SUPPORT.md`: where to ask questions and what isn't supported.
- `CODE_OF_CONDUCT.md`: adopt an existing code and name a real enforcement contact; don't write one from scratch.
- Issue and PR templates: `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md`. Ask only for what triage needs.
- `CODEOWNERS`: in `.github/`, root, or `docs/` (GitHub uses the first it finds). The last matching pattern wins, so put broad patterns first and specific ones after.

## Style
- Write in the second person and the imperative ("Run …", "Set …"). Keep sentences short and skip marketing language.
- Put code blocks in fenced blocks with a language tag. Make them copy-pasteable: no `$ ` prompts, and no output mixed into the commands.
- Explain each placeholder on first use: after the block, add "Replace the following:" and a list of `<PLACEHOLDER>`: what it is.
- Use one H1 per file and relative links within the repo. Prefer links over duplicated text.
- Headings: don't skip levels (H2 then H4); use sentence case; name task headings with a bare verb ("Run the tests", not "Running the tests").
- Link text makes sense out of context: "see the [deployment runbook](…)", never "click here".
- Images and diagrams get alt text; decorative ones get empty alt (`![](…)`). Don't use screenshots of text, code, or terminal output; paste the text.
- Introduce every table in a sentence before it.

## Link and lint checks
- If the repo already configures them, run lychee (`lychee --offline --include-fragments <files>`) for relative links and anchors, and `markdownlint-cli2` on the changed Markdown.
- If it doesn't, you may suggest `lycheeverse/lychee-action` and `DavidAnson/markdownlint-cli2-action` in CI. Never add them unasked.

## Definition of done (docs)
- [ ] Every command and env var traces back to a source file, and the quickstart was run (or the gaps are marked `TODO(docs)`).
- [ ] The configuration table matches `.env.example` and the config loader.
- [ ] Setup or config changes in this PR are reflected in the README, onboarding docs (`.github/`, root, `docs/`), `AGENTS.md`, and `CLAUDE.md`.
- [ ] If the repo keeps a hand-written Keep a Changelog file, user-facing changes have an entry under `## [Unreleased]` (with a generator, follow it instead).
- [ ] There are no secrets, real hosts, or absolute local paths, and `.env` is gitignored.

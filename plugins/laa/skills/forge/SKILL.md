---
name: forge
description: Create a repo-specific Claude Code asset (subagent, skill, workflow, or hook) grounded in evidence from the codebase, register it, and smoke-test it. Use when the user asks for a custom agent/skill/command/workflow/hook for this repo, when /laa:adopt or /laa:evolve recommends one, when a procedure has been repeated manually several times, or when the same check or change keeps being fanned out over many parts of the repo.
argument-hint: <what the asset should do>
---

# /laa:forge

Request: $ARGUMENTS

Templates and authoring rules are in `${CLAUDE_SKILL_DIR}/references/templates.md`. Read it before writing anything.

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the mode line, write a step line as each step starts (steps 1–5), ask every ★ gate as a gate card, and end with the closing report and **Next**.

## Git: branch first
Assets are code, so they go on a branch:
- **On the default branch**: `git switch -c chore/laa-<asset-name>` before writing.
- **Uncommitted changes unrelated to this**: use a new git worktree instead.
- **Called from `laa:adopt` or `laa:evolve`**: stay on the branch they created.

Commit there. Don't merge, push, or open a PR unless the user asks.

## 1. Choose the right kind
| The need | Kind | Location |
|---|---|---|
| Deep knowledge of one area, used as a delegate (for example a billing-domain expert) | **agent** | `.claude/agents/<name>.md` |
| A repeatable multi-step procedure or conventions Claude should follow (for example "add an endpoint", "write a migration") | **skill** | `.claude/skills/<name>/SKILL.md` |
| The same check or change fanned out over many similar units, or several independent perspectives on one question (for example "audit every handler for tenant checks", "review each bounded context") | **workflow** | `.claude/workflows/<name>.js` |
| Something that must *always* happen or never happen, deterministically (format on edit, block edits to generated files) | **hook** | `.claude/settings.json` → `hooks` (+ script in `.claude/hooks/`) |
| A one-line rule that applies everywhere | **CLAUDE.md rule** | `CLAUDE.md` |

Prefer the lightest kind that works: a CLAUDE.md line over a skill, a skill over an agent, and an agent over a workflow. Say which you chose and why.

## 2. Gather evidence
Before writing, find the real patterns: 2–3 concrete examples in the repo (`path:line`), the exact commands, file locations, and naming. An asset without evidence is a guess. If you can't find evidence, say so and ask.

## 3. Write it
Unless `laa:adopt` or `laa:evolve` already got approval for this asset, first ★ show its kind, name, path, and one-line purpose as a gate card.

Use the template for that kind. Rules:
- **Description = trigger.** State when to use it, with the phrases a user would say and the file areas involved.
- Reference files by path. Don't paste large code, because it goes stale.
- Scope tools to what's needed (agents: `tools:`; skills: `allowed-tools:` only for safe read-only commands).
- Workflows follow the rules in the template: plain JavaScript, a pure-literal `meta`, accept both an args object and plain text, `pipeline()` by default, and a verify stage before reporting findings.
- Hooks must be POSIX `sh` (they run under Git Bash on Windows), fast (under 2 seconds), and quiet on success.

## 4. Smoke-test
- **Skill or agent**: run it once on a realistic small task (via the Agent tool for agents) and check it followed the procedure.
- **Workflow**: run it once on a small scope with the **Workflow** tool (`scriptPath` pointing at the new file, `args` narrowing the scope) and check the result.
- **Hook**: trigger the event once and confirm the effect.

Fix what didn't work.

## 5. Register
Append a row to `.claude/laa/assets.md`: `| name | kind | path | <today> | forge | <why + evidence ref> |`.
End with the closing report: the created files and the branch they're committed on, and in **Next**, how to try the asset.

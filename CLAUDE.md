# Working on laa-claude

This repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with plugins under `plugins/`. See README.md for the architecture.

## Authoring rules
- **Description = trigger.** Skills and agents are chosen from their `description` alone. Include the user phrases and situations that should trigger them.
- **Agents are leaves.** They do one job and return. Orchestration lives in skills (main session) and workflows. Don't write agents that delegate.
- **Agents pin `model` and `effort`** in frontmatter, so they don't depend on the session's settings. Use `opus` with `effort: high` for design, root cause, cross-cutting review, and verification, where the output must be right. Use `sonnet` for checklist-driven narrow reviewers (the stack and practice pack reviewers, and core's `api-designer` and `perf-reviewer`) and for other narrower or mechanical work, with `effort: medium` (`api-designer` and `perf-reviewer` keep `high`). Builder and implementer agents that produce a whole artifact (code for a slice, infra and CI, a PRD: `implementer`, `platform-engineer`, `product-analyst`) use `opus` with `effort: medium`. They need the stronger model, and the review, verification, or ★ gate that follows them is where `high` pays off. Skills don't set either, so the user's choice drives the main session.
- **Reviewers stay read-only.** A reviewer's "if the toolchain is available, run X" line names only commands that don't write into the checkout (builds into ignored dirs like `bin/` or `obj/` are fine), or runs them in a throwaway worktree. Check findings about generated or sidecar files from git before running anything.
- **Workflows** (`plugins/laa/workflows/*.js`):
  - They're plain JS with `export const meta` as a pure literal.
  - No `Date.now()`, `Math.random()`, or Node APIs.
  - Reference plugin agents as `agentType: 'laa:<agent>'` through the `spawn()` fallback helper at the top of each file.
  - An `agent()` call without an `agentType` sets `model` and `effort` itself (and the phase entry in `meta` gets the `model`).
  - Default to `pipeline()`. Use a barrier only when a stage needs every result, and say why in a comment.
  - Accept both an args object (from skills) and plain text (typed as `/laa:<workflow> <text>`) through the `fromText()` helper.
- **Skills** name workflows by their namespaced name (`laa:investigate`) and must keep the ★ approval gates.
  - Every skill that calls a workflow keeps the "Running the workflows" section: the Agent-tool fallback for when the Workflow tool can't be used.
  - Every skill that changes files keeps its "Git" section: a task branch, or a worktree when the checkout has unrelated uncommitted changes, and never the default branch.
  - Keep these sections consistent across skills.
- **Hooks and scripts** are POSIX `sh`. They run under Git Bash on Windows.
  - The exception is `laa-mods`: TypeScript function hooks (mods). Nothing else may depend on it, because not every Claude Code build loads mods; core's `sh` hooks must keep working without it.
  - In a mod, every function that takes `$` is declared at the top of the hooks module (`register.tsx`), since `claude plugin validate` only follows `$` there. Pure helpers can live in other files.
  - Mod behavior changes need a `*.test.ts` case under `plugins/laa-mods/tests/` (run with `claude plugin test`) instead of an eval case, plus the version bump.
  - A guard change that refuses less (a parser that drops text as "not commands") leaves the input as it is whenever it can't be certain. It needs tests of inputs `main` refused that must stay refused. Review it by running the old and new parser over the same inputs.
- **Stack-specific knowledge** goes in a stack pack (`laa-go`, `laa-dotnet`, `laa-python`, `laa-js`, `laa-godot`), not in core. **Language-agnostic practices** (commit style, docs, local environment, API docs and tests) go in a practice pack (`laa-git`, `laa-docs`, `laa-docker`, `laa-api`). The only exception is the branch/worktree safety rule, which stays in core.

## Git
Work on a branch (`feat/…`, `fix/…`), or in a git worktree when the checkout has other uncommitted changes. Never commit directly to `main`.

## Changing behavior
Any change to a skill, agent, or workflow prompt that changes behavior needs:
1. an eval case in `plugins/<plugin>/evals/<case>/` (or the repo-level `evals/<case>/` when it needs several plugins loaded) that fails before the change and passes after it, and
2. a `version` bump in that plugin's `.claude-plugin/plugin.json` (patch for wording, minor for new behavior).

The eval must use a different resource, scenario, or setting than any example in the skill or agent it tests. If pasting the skill's own example would pass every grader, the case measures recall, not whether the rule transfers.

## Checks
```
claude plugin validate .                     # marketplace
claude plugin validate ./plugins/<plugin>    # each plugin
claude --plugin-dir ./plugins/laa            # try it live
claude plugin eval ./plugins/laa --runs 1 --no-publish
claude plugin test ./plugins/laa-mods        # mod tests
npx -p typescript tsc -p plugins/laa-mods    # mod types; load it once with --plugin-dir first
```

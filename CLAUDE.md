# Working on laa-claude

This repo is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with plugins under `plugins/`. See README.md for the architecture.

## Authoring rules
- **Description = trigger.** Skills and agents are chosen from their `description` alone. Include the user phrases and situations that should trigger them.
- **Agents are leaves.** They do one job and return. Orchestration lives in skills (main session) and workflows. Don't write agents that delegate.
- **Workflows** (`plugins/laa/workflows/*.js`):
  - They're plain JS with `export const meta` as a pure literal.
  - No `Date.now()`, `Math.random()`, or Node APIs.
  - Reference plugin agents as `agentType: 'laa:<agent>'` through the `spawn()` fallback helper at the top of each file.
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
- **Stack-specific knowledge** goes in a stack pack (`laa-go`, `laa-dotnet`, `laa-python`, `laa-js`), not in core. **Language-agnostic practices** (commit style, docs, local environment) go in a practice pack (`laa-git`, `laa-docs`, `laa-docker`). The only exception is the branch/worktree safety rule, which stays in core.

## Git
Work on a branch (`feat/…`, `fix/…`), or in a git worktree when the checkout has other uncommitted changes. Never commit directly to `main`.

## Changing behavior
Any change to a skill, agent, or workflow prompt that changes behavior needs:
1. an eval case in `plugins/<plugin>/evals/<case>/` (or the repo-level `evals/<case>/` when it needs several plugins loaded) that fails before the change and passes after it, and
2. a `version` bump in that plugin's `.claude-plugin/plugin.json` (patch for wording, minor for new behavior).

## Checks
```
claude plugin validate .                     # marketplace
claude plugin validate ./plugins/<plugin>    # each plugin
claude --plugin-dir ./plugins/laa            # try it live
claude plugin eval ./plugins/laa --runs 1 --no-publish
claude plugin test ./plugins/laa-mods        # mod tests
npx -p typescript tsc -p plugins/laa-mods    # mod types; load it once with --plugin-dir first
```

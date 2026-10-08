---
name: migrate
description: Make a large mechanical change across a repository, such as upgrading Go, .NET, Python, or Node, swapping a library, renaming an API everywhere, or removing a deprecated pattern. It pilots one site, gets the recipe approved, then changes every site in parallel worktrees and verifies each batch. Use for "migrate X to Y", "upgrade to Go 1.x / .NET x / Python 3.x / Node x", "replace library A with B", "rename X everywhere", or "remove all uses of Z".
argument-hint: <the change, e.g. "replace logrus with log/slog">
---

# /laa:migrate

Change: $ARGUMENTS

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the mode line, write a step line as each step starts (steps 0–7), ask every ★ gate as a gate card, and end with the closing report and **Next**. Keep the run's journal there too, at each gate and at the end.

## Running the workflows
Steps that call a workflow use the **Workflow** tool. You may not be able to use it here, because the tool isn't available or its opt-in rules don't allow it (the user didn't type this command). In that case, run the same fan-out yourself:
1. Read the workflow's script in `${CLAUDE_PLUGIN_ROOT}/workflows/`.
2. Carry out each phase as one message with parallel Agent calls. Use the script's `agentType` values as `subagent_type` and its `model` values as `model`, reuse its prompts, and set `isolation: "worktree"` where the script does.
3. Name the mode in the mode line (`workflow mode` or `agent mode`).

## Git: branch or worktree first
In a git repository, don't change files on the default branch (`main`/`master`, or whatever `origin/HEAD` points to). Before the first file change (the pilot counts):
- **On the default branch**: create the migration branch, `git switch -c migrate/<short-slug>`.
- **On another branch**: stay if this migration belongs there. If that's unclear, ask.
- **Uncommitted changes unrelated to this migration**: don't switch branches under them. Work in a new git worktree instead (the EnterWorktree tool, or `git worktree add ../<repo>-<slug> -b migrate/<slug>`).
- Batches always run in their own worktrees on `laa/migrate-*` branches, which merge into the migration branch.

Commit only on work branches. Don't merge into the default branch, push, or open a PR unless the user asks.

## 0. Load context
Read `.claude/laa/project-map.md` and `.claude/laa/learnings.md`. For a version or library upgrade, fetch the official upgrade guide or release notes and list the breaking changes that apply to this repo.

## 1. Size it
Estimate the number of sites (`grep -rl` for the old pattern, or the build errors after a version bump). Put the path you picked in the mode line:
- **Fewer than ~10 files**: make the change directly on the migration branch, then go to step 5.
- **More**: go through every step.

## 2. Pilot
On the migration branch, migrate ONE representative site (or one small package) by hand. Build and test it. From it, write the **recipe**:
- the before → after pattern, with the pilot as a worked example (`path:line`)
- rules for the edge cases seen so far
- the verify commands (build, plus which tests)
- what must NOT change: public API, behavior, log and metric names

For a runtime or framework upgrade, the version bump itself is the pilot:
- **Go**: the go.mod `go`/`toolchain` lines
- **.NET**: `TargetFramework` plus package versions
- **Python**: `requires-python` plus the lockfile
- **Node**: `engines`/`.nvmrc` plus package versions

Then build and type-check. The sites are the resulting compile errors, type errors, deprecation warnings, and analyzer findings.

Commit the pilot. ★ **Gate: user approves the recipe.**

## 3. Find the sites and plan batches
Call the **Workflow** tool with `name: "laa:migrate-sites"` and `args: { change, recipe, verify, discoverOnly: true }`. Show the site count and the batch plan (batch id → files). ★ **Gate: user approves the plan.** They may drop or reorder batches.

## 4. Transform
1. Call the **Workflow** tool with `name: "laa:migrate-sites"` and `args: { change, recipe, verify, base: <migration branch>, batches: <approved batches> }`. Each batch runs in its own worktree, and a skeptic checks each one.
2. Merge the `laa/migrate-*` branches into the migration branch one at a time. Then run the **full** build and test suite.
3. Remove the worktrees and batch branches once merged.
4. For batches listed in `needsAttention`, fix them yourself or rerun only those batches.

## 5. Sweep for leftovers
Call `laa:migrate-sites` again with `discoverOnly: true`. Nothing should come back except sites that were deliberately skipped, each with a reason.

## 6. Review
Call the **Workflow** tool with `name: "laa:review-panel"` and `args: { base: <branch point>, requirements: "Mechanical migration: <change>. Must not change behavior. Recipe: <recipe>" }`. Fix confirmed findings and commit.

## 7. Close the loop
Run the `laa:retro` skill. Then end with the closing report: sites changed, sites skipped (with reasons), the migration branch, follow-ups, and the learnings the retro logged. In **Next**, offer to open a PR. A recipe that worked well is a good candidate for a repo-local skill (see `laa:forge`).

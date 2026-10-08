---
name: feature
description: Build a feature in an existing codebase by exploring, clarifying, running a design panel, planning parallel slices, implementing them in worktrees, reviewing, and capturing learnings. Use when the user asks to add, implement, or change functionality in an existing repo ("add X", "implement Y", "we need Z to support W").
argument-hint: <feature description or ticket link>
---

# /laa:feature

Feature: $ARGUMENTS

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the mode line, write a step line as each step starts (steps 0–8), ask every ★ gate as a gate card, and end with the closing report and **Next**. Keep the run's journal there too, at each gate and at the end.

## Running the workflows
Steps that call a workflow use the **Workflow** tool. You may not be able to use it here, because the tool isn't available or its opt-in rules don't allow it (the user didn't type this command). In that case, run the same fan-out yourself:
1. Read the workflow's script in `${CLAUDE_PLUGIN_ROOT}/workflows/`.
2. Carry out each phase as one message with parallel Agent calls. Use the script's `agentType` values as `subagent_type` and its `model` values as `model`, reuse its prompts, and set `isolation: "worktree"` where the script does.
3. Name the mode in the mode line (`workflow mode` or `agent mode`).

## Git: branch or worktree first
In a git repository, don't change files on the default branch (`main`/`master`, or whatever `origin/HEAD` points to). Before the first file change:
- **On the default branch**: create the feature branch, `git switch -c feat/<short-slug>`.
- **On another branch**: stay if this feature belongs there. If that's unclear, ask.
- **Uncommitted changes unrelated to this feature**: don't switch branches under them. Work in a new git worktree instead (the EnterWorktree tool, or `git worktree add ../<repo>-<slug> -b feat/<slug>`).
- Parallel slices always run in their own worktrees on `laa/<id>` branches, which merge into the feature branch.

Commit only on work branches. Don't merge into the default branch, push, or open a PR unless the user asks.

## 0. Load context
Read `.claude/laa/project-map.md` (suggest `/laa:adopt` if it's missing), `.claude/laa/learnings.md`, and any repo-local skills in `.claude/skills/` relevant to this area. Fetch the ticket if one was given.

## 1. Size it
- **Small** (one component, clear pattern to copy, under ~200 lines): skip the design panel. Explore, plan briefly, implement directly on the feature branch, and review with a single `laa:reviewer` agent.
- **Medium/Large** (new component, schema or contract changes, cross-cutting): go through every step.
Put the size in the mode line, and say why in one line.

## 2. Explore
Launch 2–3 `laa:explorer` agents **in parallel** (one message, several Agent calls), each on a different area this feature touches, such as the entry points, the domain/data layer, and a similar existing feature to copy. Then read the key files they list.

## 3. Clarify
Using **AskUserQuestion**, ask only what the code and request can't answer: behavior at edge cases, scope boundaries, backward compatibility, and permissions/tenancy. Offer concrete options with a recommendation. Wait for answers.

## 4. Design
Call the **Workflow** tool with `name: "laa:design-panel"` and
`args: { requirements: <feature + answers + acceptance criteria>, context: <project-map excerpt + explorer findings> }`.
For a feature inside an existing system, pass lenses that fit, for example `["minimal change following existing patterns", "cleanest long-term design", "safest rollout (flags, backward compat)"]`.
Present the blueprint, the ranking, and the deep-dives (data model, API, threat model, scale risks, infra) concisely. Record significant decisions as ADRs in `docs/adr/` (or the repo's existing ADR location).

## 5. Plan slices
Turn the blueprint's build sequence into work items: `{ id, title, spec, files, acceptance }`.
- Items that run in parallel **must not touch the same files or change a shared contract**. Put shared foundations (schema migration, shared types, contracts) in a first sequential slice.
- Show the plan (a numbered list, marking which run in parallel). ★ **Gate: user approves the plan**, as a gate card, before any code is written.

## 6. Implement
1. On the feature branch, implement the foundation slice first (in this session or as a single implementer), then commit.
2. Call the **Workflow** tool with `name: "laa:implement-slices"` and `args: { base: <feature branch>, slices: [...], conventions: <project-map conventions section> }`.
3. Merge the resulting `laa/<id>` branches into the feature branch one at a time. Resolve conflicts, then run the **full** build and test suite after all merges.
4. Remove the worktrees and branches once merged (`git worktree remove`, `git branch -d`).

## 7. Review
Call the **Workflow** tool with `name: "laa:review-panel"` and `args: { base: <branch point>, requirements: <acceptance criteria>, extraReviewers: <installed stack and practice reviewers, picked as in /laa:review step 2, e.g. ["laa-go:go-reviewer", "laa-git:git-reviewer"]> }`. Fix confirmed findings and commit.

## 8. Close the loop
Run the `laa:retro` skill. Then end with the closing report: what shipped, the decisions made, the feature branch, and follow-ups. In **Next**, offer to open a PR.

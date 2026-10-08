---
name: build
description: Take a product idea from zero to a running, well-architected codebase covering PRD, architecture judge panel, ADRs, milestone plan, scaffold, repo-specific agents, and parallel milestone implementation. Use when the user wants to create a new product, SaaS, service, or system from scratch ("I want to build a SaaS that...", "create a new service for..."). Preferred over general system-design skills for building something new when this toolkit is installed.
argument-hint: <product idea>
---

# /laa:build

Idea: $ARGUMENTS

This is the heaviest pipeline in the toolkit. Keep the user in the loop at every ★ gate, each asked as a gate card. Never run past a gate without approval.

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the mode line, write a step line as each step starts (phases 1–6, as `▸ 2/6 · Architecture`), ask every ★ gate as a gate card, and end with the closing report and **Next**. Keep the run's journal there too, at each gate and at the end.

## Running the workflows
Steps that call a workflow use the **Workflow** tool. You may not be able to use it here, because the tool isn't available or its opt-in rules don't allow it (the user didn't type this command). In that case, run the same fan-out yourself:
1. Read the workflow's script in `${CLAUDE_PLUGIN_ROOT}/workflows/`.
2. Carry out each phase as one message with parallel Agent calls. Use the script's `agentType` values as `subagent_type` and its `model` values as `model`, reuse its prompts, and set `isolation: "worktree"` where the script does.
3. Name the mode in the mode line (`workflow mode` or `agent mode`).

## Git: branches and worktrees
- **New repo**: `git init`. Milestone 0 is the initial commit on the default branch, because a repo needs one commit to branch from.
- **From Milestone 1 on** (and from the start when building inside an existing repo): each milestone gets its own branch, `feat/m<N>-<slug>`. Slice branches from parallel worktrees merge into it. It merges into the default branch only after the user approves the milestone.
- **Uncommitted changes unrelated to this work**: don't switch branches under them. Use a new git worktree (the EnterWorktree tool, or `git worktree add`).
- Commit only on work branches (plus the initial commit). Don't push or open PRs unless the user asks.

## Phase 1: Intake → PRD
1. Delegate to the `laa:product-analyst` agent with the idea. It returns a PRD draft with open questions.
2. Ask the open questions with **AskUserQuestion** (at most 4 per round, each with concrete options and a recommendation). Also confirm these if they weren't stated:
   - Preferred stack. Default to what the installed stack packs cover (`laa-go`, `laa-dotnet`, `laa-python`, `laa-js`).
   - Hosting target: cloud provider, or a PaaS such as Fly, Render, or Railway.
   - Tenancy model.
   - Budget constraints.
3. Write the final PRD to `docs/prd.md`. ★ **Gate: user approves the PRD.**

## Phase 2: Architecture (fan-out)
1. Call the **Workflow** tool with `name: "laa:design-panel"` and `args: { requirements: <PRD> }`. The default lenses (simplicity / scale / cost) suit greenfield work.
2. Write:
   - `docs/architecture.md`: the blueprint, plus the data model, API, threat model, scale-risk, and infra deep-dives.
   - `docs/adr/NNNN-<decision>.md`: one ADR per key decision (context, options, decision, consequences).
3. Present a short summary: the chosen architecture, why it won, and the top 3 risks. ★ **Gate: user approves the architecture.**

## Phase 3: Plan
Write `docs/plan.md` with milestones. Each milestone is deployable and demoable. Split each into work items `{ id, title, spec, files, acceptance }`, marking which can run in parallel. Items touching the same files or a shared contract must be sequential.
**Milestone 0 is always the walking skeleton**:
- repo layout
- build, lint, and test commands
- CI pipeline
- config and secrets loading
- structured logging, health endpoint, and tracing hooks
- DB and migrations wiring
- auth stub
- tenant resolution
- one end-to-end request with a test
- a Dockerfile

★ **Gate: user approves the plan.**

## Phase 4: Scaffold (Milestone 0)
1. `git init` if needed. Implement the app skeleton of M0 **in this session**, following the stack pack's conventions skill. It defines the conventions everything else copies.
2. Delegate the Dockerfile, CI pipeline, and observability wiring to the `laa:platform-engineer` agent in **implement** mode, following the infra deep-dive.
3. Get build, lint, and tests green and commit.
4. Run the `laa:adopt` skill on the new repo. This produces `.claude/laa/project-map.md`, repo-specific agents and skills (for example a domain-expert agent for the core bounded context), and the `.claude/settings.json` plugin wiring. It commits on its own branch. With the user's OK, merge that branch into the default branch before Milestone 1, so every worktree gets the project map.

## Phase 5: Milestones 1..N
For each milestone:
1. Create the milestone branch `feat/m<N>-<slug>` from the default branch.
2. Call the **Workflow** tool with `name: "laa:implement-slices"` and `args: { base: <milestone branch>, slices, conventions }`.
3. Merge the slice branches into the milestone branch, run the full test suite, and clean up the worktrees.
4. Call the **Workflow** tool with `name: "laa:review-panel"` and `args: { base: <milestone start>, requirements: <milestone acceptance criteria>, extraReviewers: <installed stack and practice reviewers, picked as in /laa:review step 2> }`, then fix confirmed findings.
5. Tick the milestone off in `docs/plan.md` and commit. Give a short status update. ★ **Gate: user approves merging the milestone into the default branch and continuing to the next one.**

## Phase 6: Close the loop
Run the `laa:retro` skill, then end with the closing report: the milestones done, the default branch state, and **Next**. For a build this size, expect learnings both for the new repo (local) and for the toolkit itself (generic, such as a missing SaaS-essentials item or a weak prompt).

---
name: fix
description: Fix a bug end to end by reproducing it, fanning out investigators, verifying the root cause, applying a minimal fix with a regression test, reviewing it, and capturing learnings. Use when the user reports a bug, error, failing test, or regression, or says "fix X", "X is broken", "why does X happen", "investigate why X", "debug X", or "X returns a 500 / an error". Preferred over general-purpose debugging skills, and over typing the laa:investigate engine, when this toolkit is installed.
argument-hint: <bug description, error, stack trace, or issue link>
---

# /laa:fix

Bug: $ARGUMENTS

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the mode line, write a step line as each step starts (steps 0–7), ask every ★ gate as a gate card, and end with the closing report and **Next**. Keep the run's journal there too, at each gate and at the end.

## Running the workflows
Steps that call a workflow use the **Workflow** tool. You may not be able to use it here, because the tool isn't available or its opt-in rules don't allow it (the user didn't type this command). In that case, run the same fan-out yourself:
1. Read the workflow's script in `${CLAUDE_PLUGIN_ROOT}/workflows/`.
2. Carry out each phase as one message with parallel Agent calls. Use the script's `agentType` values as `subagent_type` and its `model` values as `model`, reuse its prompts, and set `isolation: "worktree"` where the script does.
3. Name the mode in the mode line (`workflow mode` or `agent mode`).

## Git: branch or worktree first
In a git repository, don't change files on the default branch (`main`/`master`, or whatever `origin/HEAD` points to). Before the first file change (the reproduction test counts):
- **On the default branch**: create a branch for this bug, `git switch -c fix/<short-slug>`.
- **On another branch**: stay if this fix belongs there. If that's unclear, ask.
- **Uncommitted changes unrelated to this bug**: don't switch branches under them. Work in a new git worktree instead (the EnterWorktree tool, or `git worktree add ../<repo>-<slug> -b fix/<slug>`).

Commit only on the work branch. Don't merge into the default branch, push, or open a PR unless the user asks.

## 0. Load context
- Read `.claude/laa/project-map.md` if it exists. If it doesn't and the repo is non-trivial, suggest `/laa:adopt` afterwards, but don't block on it.
- Check `.claude/laa/learnings.md` for past bugs in the same area.
- If the bug description is an issue link or ID, fetch it (`gh issue view`, or whatever tracker tools are available).

## 1. Triage the size
Decide which size fits and put it in the mode line:
- **Trivial** (obvious from the error: typo, wrong constant, missing null check at the reported line): fix it directly on the work branch, add a regression test, then go to step 6.
- **Standard** (cause not obvious, or more than one plausible cause): go through all steps.
- **Hard** (intermittent, concurrency, prod-only, or data-dependent): all steps, with `thorough: true` in step 3.

## 2. Reproduce first
Delegate to the `laa:test-engineer` agent in **reproduce** mode: the smallest test that fails *because of the bug*. Confirm the failure matches the reported symptom.
If it can't be reproduced, collect what's missing (logs, input data, environment, version) and ask the user targeted questions. Don't guess-fix an unreproduced bug unless the user explicitly accepts that.

## 3. Investigate (fan-out)
Call the **Workflow** tool with `name: "laa:investigate"` and
`args: { bug, repro: <failing test + output>, context: <relevant project-map excerpt>, thorough: <true for Hard> }`.
Optionally narrow `angles` (defaults: recent-changes, data-flow, config-env, concurrency, data-state). Drop angles that clearly don't apply, such as concurrency for a pure function.

## 4. Decide
Present the surviving root causes, ranked, each with its evidence and verification votes. If the top one is clearly confirmed, proceed. If the survivors conflict or all are uncertain, run the `howToConfirm` check yourself, or ★ ask which root cause to fix as a gate card (the causes are the options).

## 5. Fix
- Apply the **minimal** fix at the root cause, not at the symptom. Follow the repo's conventions.
- The reproduction test must now pass. Run the surrounding test suite too.
- If the same flawed pattern exists elsewhere (`grep` for it), list those sites and ★ ask whether to fix them in this change, as a gate card. Many sites across the repo is a job for `/laa:migrate`.

## 6. Review
For standard and hard bugs, call the **Workflow** tool with `name: "laa:review-panel"` and
`args: { base: <branch point>, requirements: "Fix: <root cause>. Must not change behavior beyond the fix." }`.
For trivial ones, a single `laa:reviewer` agent is enough. Address any confirmed findings, then commit on the work branch.

## 7. Close the loop
- End with the closing report: root cause (`path:line`), fix, test added, branch, and follow-ups. In **Next**, offer to open a PR.
- Run the **retro** step (the `laa:retro` skill): was this a bug *class* that could recur? If so, propose a prevention, such as a lint rule, a hook, a repo-local skill rule, or a test helper. Suggestions only; don't apply them without approval.

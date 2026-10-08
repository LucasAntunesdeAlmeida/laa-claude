---
name: evolve
description: Turn accumulated learnings into concrete, reviewed improvements. Repo-local learnings become diffs to this repo's CLAUDE.md, skills, and agents. Generic learnings become a PR to the laa-claude toolkit with an eval case. Every change is shown as a diff and needs approval. Use when the user runs /laa:evolve or accepts a retro suggestion to evolve.
argument-hint: "[local|upstream|all]"
disable-model-invocation: true
---

# /laa:evolve

Mode: $ARGUMENTS (default: all)

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the mode line, write a step line as each step starts (steps 1–5), ask every ★ gate as a gate card, and end with the closing report and **Next**.

**Guardrail: nothing is changed without showing the diff and getting explicit approval.** Instructions that edit themselves without review drift and get worse. Every change must trace back to a learning with evidence.

## 1. Gather
- `.claude/laa/learnings.md`: the entries with `status: open`.
- `.claude/laa/assets.md`: the repo-local assets and why they exist.
- If they're available, the persistent memories of laa agents for this project (reviewer, investigator, security-reviewer). Look for patterns noted there repeatedly.

## 2. Cluster and prioritize
Group the learnings that point at the same target. Rank them by frequency × impact. Drop one-off noise: a single occurrence of a minor preference is not a rule yet. Leave it open.

## 3. Local improvements (scope: local)
For each cluster, draft the **smallest** edit that would have prevented the signal:
- a line in `CLAUDE.md`
- a step or rule in a `.claude/skills/*` file
- an agent instruction
- a correction to `project-map.md`
- a new asset (hand off to the `laa:forge` skill)

Show every diff with the learning entries it resolves, and ★ ask about each one as a gate card. On approval, apply it on a work branch, never on the default branch. If you're on the default branch, create `chore/laa-evolve` first, or use a git worktree if the checkout has unrelated uncommitted changes. Mark those entries `status: applied (<file>)`, update `assets.md`, and commit on that branch. Mark any rejected proposals `status: rejected (<reason>)` so they aren't proposed again.

## 4. Upstream improvements (scope: generic)
The toolkit source is the `laa-claude` repo. **Never edit the installed plugin cache** under `~/.claude/plugins/`.
1. Locate a local clone: the `LAA_REPO` env var if set, otherwise ask the user for its path (or offer to `gh repo clone <owner>/laa-claude` into a temp dir).
2. In that clone, create branch `evolve/<short-slug>` from an up-to-date `main`. If the clone has uncommitted changes, don't switch branches under them: create a git worktree for the new branch and work there.
3. For each approved generic change:
   - Edit the target skill, agent, or workflow in `plugins/<plugin>/...`. Keep edits minimal and general; strip anything specific to this repo.
   - **Add an eval case** that would have caught the problem: `plugins/<plugin>/evals/<case-name>/prompt.md` plus `graders/*.md`. Follow the existing cases there. No eval means no change.
   - Bump `version` in that plugin's `.claude-plugin/plugin.json` (patch for wording, minor for new behavior).
4. Show the full diff. ★ **Gate: user approves the upstream change**, as a gate card. Then commit, and if a remote exists, push and open a PR with `gh pr create`. Put the source learnings (sanitized, with no proprietary code or names) in the body.
5. Mark the learnings `status: upstreamed (<PR url or branch>)`.

## 5. Report
End with the closing report: what was applied locally, what was proposed upstream, and what was left open, and why.

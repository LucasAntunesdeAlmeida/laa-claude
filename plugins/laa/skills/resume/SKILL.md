---
name: resume
description: Resume a laa pipeline (/laa:fix, /laa:feature, /laa:migrate, /laa:build) that stopped at a ★ gate or partway through, from its journal in .claude/laa/local/runs/. Use when the user says "resume", "continue where we left off", "pick up the feature again", or "what was I doing on this branch", after /clear, a compaction, or time away.
argument-hint: "[branch]"
---

# /laa:resume

Branch (optional): $ARGUMENTS

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`: start with the resumed pipeline's mode line, ending in `resumed from <n>/<last>`, and from then on format the run as that pipeline does.

## 1. Find the journal
- **Branch**: the argument, else the current branch (`git branch --show-current`, or the `ref: refs/heads/<branch>` line of `.git/HEAD` without a shell).
- **Journal**: `.claude/laa/local/runs/<branch with / replaced by ->.md`.
- **Missing**: list the journals in `.claude/laa/local/runs/` (skill, branch, step, status) and ★ ask which to resume, as a gate card where the journals are the options. With none, say so, and name the entry skill that fits what the user described.
- **`status: done`**: the run finished. Show its last step and plan, and stop.

## 2. Rebuild the context
- Read the journal's request, decisions, and plan, plus `.claude/laa/project-map.md` if it exists.
- With a shell, check the journal against the branch: `git log --oneline <default branch>..HEAD` and `git status`. If the branch contradicts the journal (a slice it lists as pending is already merged), trust the branch and say what differs in one line.

## 3. Continue
- Load the pipeline's skill (`laa:<skill>` from the journal's heading) and follow it from the journal's step. Don't redo finished steps or gates that were already approved.
- **Stopped at a ★ gate**: ask that gate again first, as a gate card, built from the journal's plan. Nothing else runs before the answer.
- From here on, the pipeline keeps the journal as usual.

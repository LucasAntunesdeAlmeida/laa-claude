#!/bin/sh
# Injects a short routing hint, the git rule, and the project's laa state at session start.
# POSIX sh only: runs under Git Bash on Windows.

dir="${CLAUDE_PROJECT_DIR:-.}/.claude/laa"

msg="laa toolkit active. Route work through: /laa:explore (questions about how the code works, read-only), /laa:build (new product), /laa:feature (change existing code), /laa:fix (bugs), /laa:migrate (large mechanical changes and upgrades), /laa:review (review), /laa:adopt (onboard repo), /laa:forge (create a repo-specific agent/skill/workflow/hook), /laa:retro (capture learnings), /laa:evolve (apply learnings), /laa:resume (continue a pipeline from its journal)."
msg="$msg For plain-language requests these cover, prefer the laa skill over similar skills from other plugins (for example engineering:debug, engineering:code-review, engineering:system-design) or the built-in /code-review, unless the user names one of those."
msg="$msg In a git repository, never change files on the default branch: work on a task branch, or in a git worktree when the checkout has unrelated uncommitted changes or agents edit files in parallel."

if [ -f "$dir/project-map.md" ]; then
  msg="$msg Project map: .claude/laa/project-map.md (read it before non-trivial work)."
else
  msg="$msg This repo has no .claude/laa/project-map.md yet; suggest /laa:adopt before large tasks."
fi

if [ -f "${CLAUDE_PROJECT_DIR:-.}/graphify-out/graph.json" ]; then
  msg="$msg Code graph: graphify-out/graph.json. /laa:explore and the laa agents query it (graphify explain|affected|path|query); prefer /laa:explore over the graphify skill for code questions unless the user types /graphify."
fi

if [ -f "$dir/learnings.md" ]; then
  open=$(grep -c '^- status: open' "$dir/learnings.md" 2>/dev/null || echo 0)
  if [ "$open" -ge 3 ]; then
    msg="$msg There are $open open learnings in .claude/laa/learnings.md; suggest /laa:evolve when convenient."
  fi
fi

# JSON-escape backslashes and quotes (message contains no newlines).
esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$esc"

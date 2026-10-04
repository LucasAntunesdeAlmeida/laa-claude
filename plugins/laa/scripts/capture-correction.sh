#!/bin/sh
# When a prompt looks like a correction, remind Claude to log it as a learning, so feedback given
# outside laa commands isn't lost. Only active in repos adopted by laa (.claude/laa/ exists).
# POSIX sh only: runs under Git Bash on Windows.

dir="${CLAUDE_PROJECT_DIR:-.}/.claude/laa"
[ -d "$dir" ] || exit 0

input=$(cat)
# Everything after "prompt": in the hook JSON is enough to match on.
prompt=$(printf '%s' "$input" | sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"//p')
[ -n "$prompt" ] || exit 0

# English and Portuguese correction phrases. Keep the list tight: every false positive costs context.
pattern="^(no|nope|wrong|n(ã|a)o)([ ,.!]|$)|that(’|')?s (wrong|not right|incorrect)|not what i (asked|meant|wanted)"
pattern="$pattern|i (told|said|asked) you|you (forgot|missed|ignored|broke)|you should(n(’|')?t| not| have)"
pattern="$pattern|(don(’|')?t|do not|stop|never) (do|use|using|add|put|write|change|make|commit|create)"
pattern="$pattern|(isso|t(á|a)|est(á|a)) errado|n(ã|a)o (é|e|era) (isso|assim)|j(á|a) (falei|disse)"
pattern="$pattern|voc(ê|e) (esqueceu|errou)|n(ã|a)o (faça|faca|use|coloque|mude|crie)"

printf '%s' "$prompt" | grep -Eiq "$pattern" || exit 0

msg="The user's message may be a correction. Handle it first. Then, if it reveals a durable preference, convention, or repo fact (not a one-off), append one entry to .claude/laa/learnings.md in the laa:retro format (scope, kind: correction, target, signal quoting the user, proposal, status: open) and say so in one line."
esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$esc"

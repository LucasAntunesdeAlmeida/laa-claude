#!/bin/sh
# When a prompt looks like a correction, remind Claude to log it as a learning, so feedback given
# outside laa commands isn't lost. Only active in repos adopted by laa: .claude/laa/ holds learnings.md or
# project-map.md (a folder holding only laa's local state doesn't count).
# POSIX sh only: runs under Git Bash on Windows. Tested by scripts/tests/capture-correction.test.sh.

dir="${CLAUDE_PROJECT_DIR:-.}/.claude/laa"
[ -f "$dir/learnings.md" ] || [ -f "$dir/project-map.md" ] || exit 0

input=$(cat)
# Everything after "prompt": in the hook JSON is enough to match on, minus the closing quote and brace.
prompt=$(printf '%s' "$input" | sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"//p' | sed 's/"[[:space:]]*}[[:space:]]*$//')
[ -n "$prompt" ] || exit 0

# English and Portuguese correction phrases. Keep the list tight: every false positive costs context.
pattern="that(’|')?s (wrong|not right|incorrect)|not what i (asked|meant|wanted)"
pattern="$pattern|i (told|said|asked) you|you (forgot|missed|ignored|broke)|you should(n(’|')?t| not| have)"
pattern="$pattern|(don(’|')?t|do not|stop|never) (do|use|using|add|put|write|change|make|commit|create)"
pattern="$pattern|(isso|t(á|a)|est(á|a)) errado|n(ã|a)o (é|e|era) (isso|assim)|j(á|a) (falei|disse)"
pattern="$pattern|voc(ê|e) (esqueceu|errou)|n(ã|a)o (faça|faca|use|coloque|mude|crie)"
# A reply that opens with a bare no, unless the no only declines or reassures ("no rush", "no, that's fine").
lead="^(no|nope|wrong|n(ã|a)o)([ ,.!]|$)"
benign="^(no|n(ã|a)o)[ ,.!]+(problem|problema|worries|worry|rush|hurry|pressa|need|precisa|thanks|thank you|obrigad|that(’|')?s (fine|ok|okay|great)|(t(á|a)|est(á|a)) (bom|ok|certo|ótimo|otimo)|tudo bem)([ ,.!]|$)"

if ! printf '%s' "$prompt" | grep -Eiq "$pattern"; then
  printf '%s' "$prompt" | grep -Eiq "$lead" || exit 0
  printf '%s' "$prompt" | grep -Eiq "$benign" && exit 0
fi

msg="The user's message may be a correction. Handle it first. Then, if it reveals a durable preference, convention, or repo fact (not a one-off), append one entry to .claude/laa/learnings.md in the laa:retro format (scope, kind: correction, target, signal quoting the user, proposal, status: open) and say so in one line."
esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$esc"

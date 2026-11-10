#!/bin/sh
# When a prompt looks like a correction, remind Claude to log it as a learning, so feedback given
# outside laa commands isn't lost. Only active in repos adopted by laa: .claude/laa/ holds learnings.md or
# project-map.md (a folder holding only laa's local state doesn't count).
# POSIX sh only: runs under Git Bash on Windows. Tested by scripts/tests/capture-correction.test.sh.

dir="${CLAUDE_PROJECT_DIR:-.}/.claude/laa"
[ -f "$dir/learnings.md" ] || [ -f "$dir/project-map.md" ] || exit 0

input=$(cat)
# Take only the prompt's own string, from its opening quote to the first quote that isn't escaped: the
# fields after it in the hook JSON aren't the user speaking. JSON encoders may escape an opening angle
# bracket as a unicode escape, so the same sed turns that back into the bracket for the marker check below.
prompt=$(printf '%s' "$input" | sed -En \
  -e 's/.*"prompt"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)".*/\1/' -e 't found' -e 'd' \
  -e ':found' -e 's/[\]u003[cC]/</g' -e 'p')
[ -n "$prompt" ] || exit 0

# The harness injects subagent hand-backs and background-task notifications as user turns. They aren't
# the user speaking, so they're never corrections.
for marker in '<agent-message' '[Subagent hand-back]' '<task-notification' '[SYSTEM NOTIFICATION'; do
  case "$prompt" in *"$marker"*) exit 0 ;; esac
done

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

msg="The user's message may be a correction. Handle it first. Then, if it reveals a durable preference, convention, or repo fact (not a one-off), log it: on a work branch, append one entry to .claude/laa/learnings.md in the laa:retro format (scope, kind: correction, target, signal quoting the user, proposal, status: open) and say so in one line. On the default branch, write nothing: name the learning in one line and suggest /laa:retro."
# The message has no quotes or backslashes, so it goes into the JSON as it is. Keep it that way.
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$msg"

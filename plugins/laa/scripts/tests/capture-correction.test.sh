#!/bin/sh
# Feeds prompts to capture-correction.sh in a throwaway adopted repo and checks which ones it flags.
# POSIX sh. Run: sh plugins/laa/scripts/tests/capture-correction.test.sh
set -u

here=$(cd "$(dirname "$0")" && pwd)
hook="$here/../capture-correction.sh"
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
mkdir -p "$repo/.claude/laa"
fail=0

flags() {
  printf '{"session_id":"s1","hook_event_name":"UserPromptSubmit","prompt":"%s"}' "$1" \
    | CLAUDE_PROJECT_DIR="$repo" sh "$hook" | grep -q additionalContext
}

expect() {
  want=$1
  shift
  if flags "$1"; then got=flagged; else got=quiet; fi
  if [ "$got" != "$want" ]; then
    echo "FAIL: \"$1\" was $got, expected $want"
    fail=1
  fi
}

# Corrections.
expect flagged "no, use slog instead of logrus"
expect flagged "No"
expect flagged "nope"
expect flagged "that's wrong, the port is 8081"
expect flagged "you forgot the migration"
expect flagged "don't use errors.New here"
expect flagged "no rush, but you forgot the tests"
expect flagged "não, use o slog"
expect flagged "isso está errado"
expect flagged "você esqueceu o teste"

# Not corrections.
expect quiet "no rush, take your time"
expect quiet "No problem, go ahead"
expect quiet "no, that's fine"
expect quiet "no worries"
expect quiet "não precisa, pode seguir"
expect quiet "tudo bem, pode seguir"
expect quiet "notes for the release are in docs/"
expect quiet "add a now() helper to the clock package"
expect quiet "fix the 500 on GET /invoices"

# Repos laa hasn't adopted are left alone.
if printf '{"prompt":"that is wrong"}' | CLAUDE_PROJECT_DIR="$repo/elsewhere" sh "$hook" | grep -q .; then
  echo "FAIL: flagged a prompt outside an adopted repo"
  fail=1
fi

[ "$fail" -eq 0 ] && echo "capture-correction: all cases pass"
exit "$fail"

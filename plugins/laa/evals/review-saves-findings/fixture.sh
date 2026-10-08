#!/bin/sh
# The billing service, adopted by laa, so the review may save its findings to local state.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p .claude/laa
printf '# Learnings\n' > .claude/laa/learnings.md

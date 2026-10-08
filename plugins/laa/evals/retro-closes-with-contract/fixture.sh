#!/bin/sh
# The billing service, adopted by laa, with an empty learnings log.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p .claude/laa
printf '# Learnings\n' > .claude/laa/learnings.md

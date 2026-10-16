#!/bin/sh
# The billing service, adopted by laa, with main checked out and a clean tree: a retro run here must not
# write the tracked learnings log on the default branch.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p .claude/laa
printf '# Learnings\n' > .claude/laa/learnings.md
git init -q -b main
git add -A
git -c user.email=dev@example.com -c user.name=dev commit -qm "chore: initial commit"

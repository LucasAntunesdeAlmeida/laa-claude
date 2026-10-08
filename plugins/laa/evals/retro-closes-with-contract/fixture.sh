#!/bin/sh
# The billing service, adopted by laa, on the fix branch the prompt describes, with an empty learnings log.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p .claude/laa
printf '# Learnings\n' > .claude/laa/learnings.md
git init -q -b main
git add -A
git -c user.email=dev@example.com -c user.name=dev commit -qm "chore: initial commit"
git switch -qc fix/invoice-no-address

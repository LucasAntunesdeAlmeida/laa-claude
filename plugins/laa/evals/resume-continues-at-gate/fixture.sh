#!/bin/sh
# The billing service on a feature branch whose /laa:feature run stopped at the plan gate.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
git init -q -b main
git add -A
git -c user.email=dev@example.com -c user.name=dev commit -qm "chore: initial commit"
git switch -qc feat/csv-export
mkdir -p .claude/laa/local/runs
printf '*\n' > .claude/laa/local/.gitignore
cat > .claude/laa/local/runs/feat-csv-export.md <<'MD'
# laa:feature · feat/csv-export
- status: waiting
- step: 5/8 · Plan slices
- gate: ★ Approve the plan?
- request: export invoices as CSV from GET /invoices/export, emailed when ready

## Decisions
- size: medium (new table, endpoint, and worker)
- design: proposal 1, minimal change following existing patterns (judges 8.1)

## Plan
1. export_jobs table and goose migration (foundation, sequential)
2. GET /invoices/export handler that enqueues a job (parallel)
3. worker that renders the CSV to object storage (parallel)
4. email when the export is ready (parallel)
MD

#!/bin/sh
# The billing service with one open, repo-local learning ready to evolve.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p .claude/laa
printf '# Billing service\n\nRun with `go run ./cmd/billing`.\n' > CLAUDE.md
cat > .claude/laa/learnings.md <<'MD'
# Learnings

## 2030-01-15 · laa:fix · Wrap errors with %w
- scope: local
- kind: correction
- target: CLAUDE.md
- signal: the user corrected errors.New to fmt.Errorf("...: %w", err), as in internal/config/config.go
- proposal: add to CLAUDE.md: "Wrap errors with fmt.Errorf and %w; never errors.New around another error."
- status: open

## 2030-01-16 · laa:feature · Migrations need a Down
- scope: local
- kind: missed-step
- target: CLAUDE.md
- signal: a goose migration shipped without a -- +goose Down section and the reviewer caught it
- proposal: add to CLAUDE.md: "Every goose migration has a -- +goose Down section."
- status: open
MD

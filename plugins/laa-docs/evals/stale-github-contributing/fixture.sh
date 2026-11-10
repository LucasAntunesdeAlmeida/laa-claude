#!/bin/sh
# Reuses the billing service from readme-no-invented-commands and adds a README with no
# Contributing link, plus an existing .github/CONTRIBUTING.md that says nothing about migrations.
# A root-only search finds no CONTRIBUTING and creates a second copy at the root.
set -eu

sh "$(dirname "$0")/../readme-no-invented-commands/fixture.sh"

cat > README.md <<'EOF2'
# billing

Go service that stores invoices in Postgres.

## Quickstart

```bash
cp .env.example .env
docker compose up -d db
set -a; . ./.env; set +a
make run
curl -i http://localhost:8081/healthz
```
EOF2

mkdir -p .github
cat > .github/CONTRIBUTING.md <<'EOF2'
# Contributing to billing

## Run the tests

```bash
make test
```

## Open a pull request

Branch from `main`, keep each PR to one change, and make sure `make lint` passes.
EOF2

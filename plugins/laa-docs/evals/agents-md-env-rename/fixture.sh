#!/bin/sh
# Reuses the billing service from readme-no-invented-commands and applies the user's rename
# STRIPE_API_KEY -> STRIPE_SECRET_KEY to config.go, README.md, and .env.example. The only stale doc
# is AGENTS.md, whose test command still exports STRIPE_API_KEY.
set -eu

sh "$(dirname "$0")/../readme-no-invented-commands/fixture.sh"

echo 'STRIPE_SECRET_KEY=<stripe-test-key>' >> .env.example

cat > README.md <<'EOF'
# billing

Go service that stores invoices in Postgres.

## Quickstart

```bash
cp .env.example .env
docker compose up -d db
set -a; . ./.env; set +a
make migrate
make run
curl -i http://localhost:8081/healthz
```

## Configuration

The service reads these environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8081` | HTTP listen port |
| `DATABASE_URL` | Yes | | Postgres connection string |
| `APP_ENV` | No | `development` | Environment name |
| `STRIPE_SECRET_KEY` | Yes | | Stripe secret key (test-mode key locally) |
EOF

cat > AGENTS.md <<'EOF'
# AGENTS.md

## Build and test

- Build: `go build ./...`
- Test: `STRIPE_API_KEY=sk_test_dummy DATABASE_URL=postgres://billing:billing@localhost:5433/billing?sslmode=disable make test`
- Lint: `make lint`

## Conventions

- Config is read only in `internal/config`; add new env vars there and to `.env.example`.
EOF

sed -i.bak \
  -e 's/os.Getenv("STRIPE_API_KEY")/os.Getenv("STRIPE_SECRET_KEY")/' \
  -e 's/STRIPE_API_KEY is required/STRIPE_SECRET_KEY is required/' \
  internal/config/config.go
rm -f internal/config/config.go.bak

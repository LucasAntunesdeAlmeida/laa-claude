#!/bin/sh
# Reuses the billing service from readme-no-invented-commands, adds a README that matches it, then
# applies the user's config change to the code only: DATABASE_URL -> PG_DSN and default port
# 8081 -> 9090. README.md, .env.example, and the Makefile's migrate target are left stale.
set -eu

sh "$(dirname "$0")/../readme-no-invented-commands/fixture.sh"

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

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8081` | HTTP listen port |
| `DATABASE_URL` | Yes | | Postgres connection string |
| `APP_ENV` | No | `development` | Environment name |
| `STRIPE_API_KEY` | Yes | | Stripe API key (test-mode key locally) |
EOF

sed -i.bak \
  -e 's/getenv("PORT", "8081")/getenv("PORT", "9090")/' \
  -e 's/os.Getenv("DATABASE_URL")/os.Getenv("PG_DSN")/' \
  -e 's/DATABASE_URL is required/PG_DSN is required/' \
  internal/config/config.go
rm -f internal/config/config.go.bak

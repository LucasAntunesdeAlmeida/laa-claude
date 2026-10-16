#!/bin/sh
# Reuses the billing service from readme-no-invented-commands and applies DATABASE_URL -> PG_DSN
# everywhere a root-only docs check looks (config.go, README.md, .env.example, Makefile). The only
# stale doc is .github/CONTRIBUTING.md, in the first location GitHub reads it from.
set -eu

sh "$(dirname "$0")/../readme-no-invented-commands/fixture.sh"

sed -i.bak \
  -e 's/os.Getenv("DATABASE_URL")/os.Getenv("PG_DSN")/' \
  -e 's/DATABASE_URL is required/PG_DSN is required/' \
  internal/config/config.go
sed -i.bak -e 's/^DATABASE_URL=/PG_DSN=/' .env.example
sed -i.bak -e 's/\$\$DATABASE_URL/$$PG_DSN/' Makefile
rm -f internal/config/config.go.bak .env.example.bak Makefile.bak

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
| `PG_DSN` | Yes | | Postgres connection string |
| `APP_ENV` | No | `development` | Environment name |
| `STRIPE_API_KEY` | Yes | | Stripe API key (test-mode key locally) |

## Contributing

See [CONTRIBUTING](.github/CONTRIBUTING.md).
EOF

mkdir -p .github
cat > .github/CONTRIBUTING.md <<'EOF'
# Contributing to billing

## Run the database locally

1. Start Postgres with `docker compose up -d db`.
2. Export the connection string:

   ```bash
   export DATABASE_URL=postgres://billing:billing@localhost:5433/billing?sslmode=disable
   ```

3. Apply migrations with `make migrate`.

## Run the tests

```bash
make test
```
EOF

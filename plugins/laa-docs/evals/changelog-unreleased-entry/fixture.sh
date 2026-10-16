#!/bin/sh
# Reuses the billing service from readme-no-invented-commands, adds a matching README and a
# Keep a Changelog CHANGELOG.md with an empty [Unreleased] section, then adds the user's new
# optional RATE_LIMIT_RPS (default 50) to the config loader only.
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

The service reads these environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8081` | HTTP listen port |
| `DATABASE_URL` | Yes | | Postgres connection string |
| `APP_ENV` | No | `development` | Environment name |
| `STRIPE_API_KEY` | Yes | | Stripe API key (test-mode key locally) |
EOF

cat > CHANGELOG.md <<'EOF'
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2025-11-03

### Added

- `GET /invoices/{id}/pdf` returns a PDF of the invoice.

### Fixed

- Invoice totals no longer round half-cents down.

## [1.3.0] - 2025-09-18

### Changed

- `APP_ENV` defaults to `development` instead of `local`.
EOF

cat > internal/config/config.go <<'EOF'
package config

import (
	"errors"
	"os"
)

type Config struct {
	Port         string
	DatabaseURL  string
	AppEnv       string
	StripeAPIKey string
	RateLimitRPS string
}

func Load() (Config, error) {
	c := Config{
		Port:         getenv("PORT", "8081"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		AppEnv:       getenv("APP_ENV", "development"),
		StripeAPIKey: os.Getenv("STRIPE_API_KEY"),
		RateLimitRPS: getenv("RATE_LIMIT_RPS", "50"),
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.StripeAPIKey == "" {
		return c, errors.New("STRIPE_API_KEY is required")
	}
	return c, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
EOF

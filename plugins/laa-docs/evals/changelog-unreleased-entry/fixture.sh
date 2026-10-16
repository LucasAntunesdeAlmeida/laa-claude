#!/bin/sh
# Reuses the billing service from readme-no-invented-commands, adds a matching README and a
# Keep a Changelog CHANGELOG.md with an empty [Unreleased] section, then adds the user's new
# optional RATE_LIMIT_RPS (default 50) to the config loader and a limiter that uses it. README.md,
# .env.example, and CHANGELOG.md are left stale.
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
	"strconv"
)

type Config struct {
	Port         string
	DatabaseURL  string
	AppEnv       string
	StripeAPIKey string
	RateLimitRPS int
}

func Load() (Config, error) {
	c := Config{
		Port:         getenv("PORT", "8081"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		AppEnv:       getenv("APP_ENV", "development"),
		StripeAPIKey: os.Getenv("STRIPE_API_KEY"),
	}
	rps, err := strconv.Atoi(getenv("RATE_LIMIT_RPS", "50"))
	if err != nil || rps <= 0 {
		return c, errors.New("RATE_LIMIT_RPS must be a positive integer")
	}
	c.RateLimitRPS = rps
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

mkdir -p internal/ratelimit
cat > internal/ratelimit/ratelimit.go <<'EOF'
// Package ratelimit caps requests per second across the whole service.
package ratelimit

import (
	"net/http"
	"time"
)

// Middleware allows up to rps requests per second and answers 429 beyond that.
func Middleware(rps int, next http.Handler) http.Handler {
	tokens := make(chan struct{}, rps)
	go func() {
		for range time.Tick(time.Second / time.Duration(rps)) {
			select {
			case tokens <- struct{}{}:
			default:
			}
		}
	}()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-tokens:
			next.ServeHTTP(w, r)
		default:
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		}
	})
}
EOF

sed -i.bak \
  -e 's#"example.com/billing/internal/config"#"example.com/billing/internal/config"\n\t"example.com/billing/internal/ratelimit"#' \
  -e 's#http.ListenAndServe(":"+cfg.Port, mux)#http.ListenAndServe(":"+cfg.Port, ratelimit.Middleware(cfg.RateLimitRPS, mux))#' \
  cmd/billing/main.go
rm -f cmd/billing/main.go.bak

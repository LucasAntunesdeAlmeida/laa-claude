#!/bin/sh
# Seeds a small Go service whose facts differ from common defaults, so a README written from habit
# (port 8080, Postgres on 5432, `make build`) is wrong. config.go reads STRIPE_API_KEY, which
# .env.example lacks: a docs-aware README documents it and flags the gap.
set -eu

mkdir -p cmd/billing internal/config migrations

cat > go.mod <<'EOF'
module example.com/billing

go 1.23
EOF

cat > cmd/billing/main.go <<'EOF'
package main

import (
	"log"
	"net/http"

	"example.com/billing/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	log.Fatal(http.ListenAndServe(":"+cfg.Port, mux))
}
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
}

func Load() (Config, error) {
	c := Config{
		Port:         getenv("PORT", "8081"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		AppEnv:       getenv("APP_ENV", "development"),
		StripeAPIKey: os.Getenv("STRIPE_API_KEY"),
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

cat > .env.example <<'EOF'
PORT=8081
DATABASE_URL=postgres://billing:billing@localhost:5433/billing?sslmode=disable
APP_ENV=development
EOF

cat > docker-compose.yml <<'EOF'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: billing
      POSTGRES_PASSWORD: billing
      POSTGRES_DB: billing
    ports:
      - "5433:5432"
EOF

cat > Makefile <<'EOF'
.PHONY: run test lint migrate

run:
	go run ./cmd/billing

test:
	go test -race ./...

lint:
	golangci-lint run

migrate:
	goose -dir migrations postgres "$$DATABASE_URL" up
EOF

cat > migrations/00001_init.sql <<'EOF'
-- +goose Up
CREATE TABLE invoices (id uuid PRIMARY KEY, customer_id uuid NOT NULL, total_cents bigint NOT NULL);
-- +goose Down
DROP TABLE invoices;
EOF

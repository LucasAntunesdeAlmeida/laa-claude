#!/bin/sh
# Seeds a compose file and CI workflow where the branch bumped Postgres from 17.6 to 18.1 and left the
# named volume at /var/lib/postgresql/data. Pins, healthcheck, ports, and CI versions are all fine, so
# the only finding is the 18+ data mount, which makes the official image refuse to start.
set -eu

mkdir -p .github/workflows

cat > compose.yaml <<'YAML'
services:
  db:
    image: postgres:18.1
    environment:
      POSTGRES_USER: ledger
      POSTGRES_PASSWORD: ledger
      POSTGRES_DB: ledger
    ports:
      - "${DB_PORT:-5434}:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ledger -d ledger"]
      interval: 2s
      retries: 15

volumes:
  db-data:
YAML

cat > .github/workflows/ci.yml <<'YAML'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18.1
        env:
          POSTGRES_USER: ledger
          POSTGRES_PASSWORD: ledger
          POSTGRES_DB: ledger
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U ledger" --health-interval 2s --health-retries 15
    steps:
      - uses: actions/checkout@v4
      - run: make test-integration
YAML

cat > .env.example <<'ENV'
DB_PORT=5434
DATABASE_URL=postgres://ledger:ledger@localhost:5434/ledger?sslmode=disable
ENV

cat > Makefile <<'MK'
.PHONY: up test-integration down

up:
	docker compose up -d --wait db

test-integration:
	go test -tags integration ./...

down:
	docker compose down
MK

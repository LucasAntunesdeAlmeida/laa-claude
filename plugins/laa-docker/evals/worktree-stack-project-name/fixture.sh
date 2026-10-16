#!/bin/sh
# Seeds a small service whose Postgres runs through compose with a variable host port, a Makefile
# integration target, and a .gitignore that ignores .env. The workspace stands in for a worktree of
# the branch feat/Order-Export; the slash and capitals make a raw branch slug an invalid project name.
set -eu

mkdir -p internal/store

cat > compose.yaml <<'YAML'
services:
  db:
    image: postgres:16.4
    environment:
      POSTGRES_USER: storefront
      POSTGRES_PASSWORD: storefront
      POSTGRES_DB: storefront
    ports:
      - "${DB_PORT:-5434}:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U storefront -d storefront"]
      interval: 2s
      retries: 15

volumes:
  db-data:
YAML

cat > .gitignore <<'IGN'
.env
/bin/
IGN

cat > .env.example <<'ENV'
DB_PORT=5434
DATABASE_URL=postgres://storefront:storefront@localhost:5434/storefront?sslmode=disable
ENV

cat > go.mod <<'GO'
module example.com/storefront

go 1.23

require github.com/jackc/pgx/v5 v5.7.1
GO

cat > internal/store/store.go <<'GO'
package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, url)
}
GO

cat > Makefile <<'MK'
.PHONY: up test-integration down

up:
	docker compose up -d --wait db

test-integration:
	go test -tags integration ./...

down:
	docker compose down
MK

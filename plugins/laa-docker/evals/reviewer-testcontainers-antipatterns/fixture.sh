#!/bin/sh
# Seeds a Go service whose compose Postgres is pinned to postgres:16.4, plus a new Testcontainers
# integration test that uses the same pinned image (so no pin or drift finding) but binds host port
# 5432, connects to localhost:5432, and sleeps five seconds instead of waiting for readiness.
set -eu

mkdir -p internal/store

cat > go.mod <<'GO'
module example.com/orders

go 1.23

require (
	github.com/jackc/pgx/v5 v5.7.1
	github.com/testcontainers/testcontainers-go v0.34.0
)
GO

cat > compose.yaml <<'YAML'
services:
  db:
    image: postgres:16.4
    environment:
      POSTGRES_USER: orders
      POSTGRES_PASSWORD: orders
      POSTGRES_DB: orders
    ports:
      - "${DB_PORT:-5434}:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orders -d orders"]
      interval: 2s
      retries: 15

volumes:
  db-data:
YAML

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

cat > internal/store/store_integration_test.go <<'GO'
//go:build integration

package store

import (
	"context"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
)

func TestOpen(t *testing.T) {
	ctx := context.Background()

	pg, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:16.4",
			ExposedPorts: []string{"5432:5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "orders",
				"POSTGRES_PASSWORD": "orders",
				"POSTGRES_DB":       "orders",
			},
		},
		Started: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.Terminate(ctx) })

	time.Sleep(5 * time.Second)

	pool, err := Open(ctx, "postgres://orders:orders@localhost:5432/orders?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
}
GO

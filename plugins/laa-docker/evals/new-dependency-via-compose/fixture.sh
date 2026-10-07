#!/bin/sh
# Seeds a small Go service whose Postgres already runs through compose (pinned, health-checked),
# then adds a Redis cache in code only: go-redis in go.mod and REDIS_URL in config. Nothing
# provides Redis locally yet, and .env.example doesn't mention it.
set -eu

mkdir -p cmd/orders internal/config internal/cache

cat > go.mod <<'GO'
module example.com/orders

go 1.23

require (
	github.com/jackc/pgx/v5 v5.7.1
	github.com/redis/go-redis/v9 v9.7.0
)
GO

cat > cmd/orders/main.go <<'GO'
package main

import (
	"log"
	"net/http"

	"example.com/orders/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	log.Fatal(http.ListenAndServe(":"+cfg.Port, http.NewServeMux()))
}
GO

cat > internal/config/config.go <<'GO'
package config

import (
	"errors"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
}

func Load() (Config, error) {
	c := Config{
		Port:        getenv("PORT", "8082"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisURL:    os.Getenv("REDIS_URL"),
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.RedisURL == "" {
		return c, errors.New("REDIS_URL is required")
	}
	return c, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
GO

cat > internal/cache/cache.go <<'GO'
package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct{ rdb *redis.Client }

func New(url string) (*Cache, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	return &Cache{rdb: redis.NewClient(opt)}, nil
}

func (c *Cache) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

func (c *Cache) Set(ctx context.Context, key, val string, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, val, ttl).Err()
}
GO

cat > .env.example <<'ENV'
PORT=8082
DATABASE_URL=postgres://orders:orders@localhost:5434/orders?sslmode=disable
ENV

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
      test: ["CMD-SHELL", "pg_isready -U orders"]
      interval: 2s
      retries: 15

volumes:
  db-data:
YAML

cat > Makefile <<'MK'
.PHONY: up test test-integration

up:
	docker compose up -d --wait

test:
	go test ./...

test-integration: up
	go test -tags integration ./...
MK

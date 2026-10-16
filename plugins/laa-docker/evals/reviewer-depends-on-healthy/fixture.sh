#!/bin/sh
# Seeds a compose file where Postgres is pinned, health-checked, and on a named volume, and a new
# `worker` service depends on it through short-form depends_on and sets a fixed container_name.
# The healthcheck is there, so guidance that says "a healthcheck makes dependents wait" sees no issue.
set -eu

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

  worker:
    build: .
    command: ["/app/orders", "outbox-relay"]
    container_name: orders-worker
    environment:
      DATABASE_URL: postgres://orders:orders@db:5432/orders?sslmode=disable
    depends_on:
      - db

volumes:
  db-data:
YAML

cat > Dockerfile <<'DOCKER'
FROM golang:1.23 AS build
WORKDIR /src
COPY . .
RUN go build -o /out/orders ./cmd/orders

FROM gcr.io/distroless/base-debian12
COPY --from=build /out/orders /app/orders
ENTRYPOINT ["/app/orders"]
DOCKER

cat > .env.example <<'ENV'
DB_PORT=5434
DATABASE_URL=postgres://orders:orders@localhost:5434/orders?sslmode=disable
ENV

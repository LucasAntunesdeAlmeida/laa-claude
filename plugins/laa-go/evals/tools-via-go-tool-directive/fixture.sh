#!/bin/sh
# Seeds a go 1.24 module that pins sqlc through the old tools.go blank-import workaround and a
# Makefile with `go run` for it. On this go line tools belong in go.mod `tool` directives run with
# `go tool`; older guidance extends tools.go and doesn't mention govulncheck.
set -eu

mkdir -p internal/order

cat > go.mod <<'GO'
module example.com/orders

go 1.24

require github.com/sqlc-dev/sqlc v1.27.0
GO

cat > tools.go <<'GO'
//go:build tools

package tools

import (
	_ "github.com/sqlc-dev/sqlc/cmd/sqlc"
)
GO

cat > internal/order/status.go <<'GO'
package order

type Status int

const (
	Pending Status = iota
	Paid
	Shipped
	Canceled
)
GO

cat > Makefile <<'MK'
.PHONY: generate check

generate:
	go run github.com/sqlc-dev/sqlc/cmd/sqlc generate

check:
	go vet ./...
	go test -race ./...
MK

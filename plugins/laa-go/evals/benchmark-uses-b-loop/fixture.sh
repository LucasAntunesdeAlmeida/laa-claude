#!/bin/sh
# Seeds a go 1.24 module with a context-taking pricing function. On this go line a benchmark
# should use `for b.Loop()` and tests should use t.Context(); older guidance writes a b.N loop
# and context.Background().
set -eu

mkdir -p internal/pricing

cat > go.mod <<'GO'
module example.com/shop

go 1.24
GO

cat > internal/pricing/pricing.go <<'GO'
package pricing

import (
	"context"
	"errors"
)

var ErrEmptyCart = errors.New("empty cart")

type Line struct {
	SKU      string
	Cents    int64
	Quantity int
}

// Quote returns the cart total in cents, applying a 10% discount at 10000 cents or more.
func Quote(ctx context.Context, lines []Line) (int64, error) {
	if len(lines) == 0 {
		return 0, ErrEmptyCart
	}
	var total int64
	for _, l := range lines {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		total += l.Cents * int64(l.Quantity)
	}
	if total >= 10000 {
		total -= total / 10
	}
	return total, nil
}
GO

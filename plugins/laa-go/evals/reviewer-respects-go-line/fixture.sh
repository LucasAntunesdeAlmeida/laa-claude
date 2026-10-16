#!/bin/sh
# Seeds a go 1.24 module with a cache warmer. On this go line, the loop closures without
# `k := k` copies are correct (per-iteration loop variables, Go 1.22), and the unstopped
# time.After in the select loop is not a leak (timers are collected, Go 1.23). The real bug is
# wg.Add(1) inside the goroutine, which races with wg.Wait().
set -eu

mkdir -p internal/warm

cat > go.mod <<'GO'
module example.com/catalog

go 1.24
GO

cat > internal/warm/warm.go <<'GO'
package warm

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type Loader interface {
	Load(ctx context.Context, key string) error
}

// Warm loads every key concurrently and waits for all of them.
func Warm(ctx context.Context, l Loader, keys []string) {
	var wg sync.WaitGroup
	for _, k := range keys {
		go func() {
			wg.Add(1)
			defer wg.Done()
			if err := l.Load(ctx, k); err != nil {
				slog.WarnContext(ctx, "warm failed", "key", k, "err", err)
			}
		}()
	}
	wg.Wait()
}

// Loop re-warms the keys until ctx is canceled.
func Loop(ctx context.Context, l Loader, keys []string, every time.Duration) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(every):
			Warm(ctx, l, keys)
		}
	}
}
GO

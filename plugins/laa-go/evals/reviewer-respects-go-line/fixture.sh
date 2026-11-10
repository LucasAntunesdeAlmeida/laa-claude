#!/bin/sh
# Seeds a go 1.24 module with a cache warmer. On this go line, the loop closures without
# `k := k` copies are correct (per-iteration loop variables, Go 1.22), and the unstopped
# time.After in the select loop is not a leak (timers are collected, Go 1.23). The real bugs are
# wg.Add(1) inside the goroutine (races with wg.Wait()), errgroup goroutines that use the outer
# ctx instead of the group's ctx, a dial address built with fmt.Sprintf (breaks on IPv6), and a
# user-supplied key joined onto a directory (path traversal; on go 1.24 the fix is os.OpenRoot
# or filepath.IsLocal).
set -eu

mkdir -p internal/warm

cat > go.mod <<'GO'
module example.com/catalog

go 1.24

require golang.org/x/sync v0.19.0
GO

cat > internal/warm/warm.go <<'GO'
package warm

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
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

// Snapshot reads the cached snapshot for key from dir. Keys come from the admin API's
// ?key= query parameter.
func Snapshot(dir, key string) ([]byte, error) {
	return os.ReadFile(filepath.Join(dir, key+".json"))
}

// Shard is a cache node from service discovery.
type Shard struct {
	Host string
	Port int
}

// CheckShards pings every shard and returns the first failure.
func CheckShards(ctx context.Context, shards []Shard) error {
	g, gctx := errgroup.WithContext(ctx)
	slog.DebugContext(gctx, "checking shards", "count", len(shards))
	var d net.Dialer
	for _, s := range shards {
		g.Go(func() error {
			conn, err := d.DialContext(ctx, "tcp", fmt.Sprintf("%s:%d", s.Host, s.Port))
			if err != nil {
				return fmt.Errorf("dial shard %s: %w", s.Host, err)
			}
			return conn.Close()
		})
	}
	return g.Wait()
}
GO

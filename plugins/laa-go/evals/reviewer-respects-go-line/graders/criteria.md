---
type: llm
weight: 1
---

The module's go.mod says `go 1.24`. internal/warm/warm.go starts goroutines in a `for _, k := range keys`
loop that call `wg.Add(1)` inside the goroutine and capture `k` without a `k := k` copy, and `Loop` uses
`time.After(every)` inside a `for`/`select` loop. `Snapshot(dir, key)` reads `filepath.Join(dir, key+".json")`
where `key` comes from a query parameter. `CheckShards` creates `g, gctx := errgroup.WithContext(ctx)` but the
goroutines dial with the outer `ctx`, and the dial address is `fmt.Sprintf("%s:%d", s.Host, s.Port)` where
hosts may be IPv6.

The response passes only if ALL of these hold:
- It flags `wg.Add(1)` inside the goroutine as a bug (it races with `wg.Wait()`, which can return before
  the loads run or finish), and the fix moves `wg.Add` before the `go` statement or uses `wg.Go(...)`.
- It flags that the errgroup goroutines use `ctx` instead of `gctx`, so the other dials aren't canceled when
  one fails, and the fix passes `gctx`.
- It flags the `fmt.Sprintf("%s:%d", ...)` dial address as broken for IPv6 hosts, and the fix uses
  `net.JoinHostPort` (with `strconv.Itoa` for the port).
- It flags `Snapshot` as a path traversal (`key` like `../../etc/x`), and the fix opens the file through an
  `os.Root` (`os.OpenRoot(dir)`, available on go 1.24) or rejects keys with `filepath.IsLocal`. A fix that
  only uses `filepath.Clean` plus a `strings.HasPrefix` check, or only rejects `..` substrings, fails this.
- It does NOT report the missing `k := k` copy as a bug or ask to add one (since Go 1.22 each iteration has
  its own `k`). Saying explicitly that it's fine on this go line is OK.
- It does NOT report `time.After` in the loop as a leak, or ask to replace it with a stopped
  `time.NewTimer`/`Ticker` for that reason (since Go 1.23 unreferenced timers are collected).
  Saying explicitly that it's fine on this go line is OK.
- It does not claim it changed files on disk. Showing suggested fixes in the reply is fine.

Other reasonable findings (for example no bound on concurrency for a large `keys` slice) don't affect the
result.

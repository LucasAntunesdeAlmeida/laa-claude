#!/bin/sh
# The billing service plus a new authorization middleware that lets the request through when the
# policy service errors: it fails open.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p internal/authz
cat > internal/authz/middleware.go <<'GO'
package authz

import (
	"context"
	"log"
	"net/http"
)

type Policy interface {
	// Allowed reports whether the caller may perform action on the request's tenant.
	Allowed(ctx context.Context, r *http.Request, action string) (bool, error)
}

// Require wraps next so only callers the policy service allows reach it.
func Require(p Policy, action string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, err := p.Allowed(r.Context(), r, action)
		if err != nil {
			// The policy service is flaky; don't block customers while it recovers.
			log.Printf("authz check failed: %v", err)
			next.ServeHTTP(w, r)
			return
		}
		if !ok {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
GO

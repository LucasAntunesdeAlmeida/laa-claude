#!/bin/sh
# The billing service plus a foundation-slice stub that a parallel slice replaces.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p internal/region
cat > internal/region/region.go <<'GO'
// Package region maps a country code to its pricing region.
package region

// Of returns the pricing region of an ISO country code: "eu" for EU
// members ("de", "fr", ...), "us" for "us".
//
// STUB (foundation slice): returns "us" for every code until work item
// W1 replaces it.
func Of(country string) string { return "us" }
GO

#!/bin/sh
# The billing service plus an invoice repository. FindByCustomer has a string-built SQL query that predates
# the change under review; the change only adds ApplyDiscount and its test, which are correct.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p internal/billing
cat > internal/billing/invoice.go <<'GO'
package billing

import (
	"database/sql"
	"fmt"
)

type Invoice struct {
	ID         string
	CustomerID string
	TotalCents int64
}

// FindByCustomer has been here since the first release.
func FindByCustomer(db *sql.DB, customerID string) ([]Invoice, error) {
	rows, err := db.Query(fmt.Sprintf("SELECT id, customer_id, total_cents FROM invoices WHERE customer_id = '%s'", customerID))
	if err != nil {
		return nil, fmt.Errorf("find invoices: %w", err)
	}
	defer rows.Close()
	var out []Invoice
	for rows.Next() {
		var inv Invoice
		if err := rows.Scan(&inv.ID, &inv.CustomerID, &inv.TotalCents); err != nil {
			return nil, fmt.Errorf("scan invoice: %w", err)
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// ApplyDiscount returns the total after a percentage discount, rounded down. pct must be 0..100.
func ApplyDiscount(totalCents int64, pct int) (int64, error) {
	if pct < 0 || pct > 100 {
		return 0, fmt.Errorf("discount %d%% out of range", pct)
	}
	return totalCents * int64(100-pct) / 100, nil
}
GO
cat > internal/billing/invoice_test.go <<'GO'
package billing

import "testing"

func TestApplyDiscount(t *testing.T) {
	cases := []struct {
		total int64
		pct   int
		want  int64
		err   bool
	}{
		{1000, 0, 1000, false},
		{1000, 15, 850, false},
		{999, 50, 499, false},
		{1000, 100, 0, false},
		{1000, -1, 0, true},
		{1000, 101, 0, true},
	}
	for _, c := range cases {
		got, err := ApplyDiscount(c.total, c.pct)
		if (err != nil) != c.err || got != c.want {
			t.Errorf("ApplyDiscount(%d, %d) = %d, %v", c.total, c.pct, got, err)
		}
	}
}
GO

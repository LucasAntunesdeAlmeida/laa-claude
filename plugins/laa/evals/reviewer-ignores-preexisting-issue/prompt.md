---
name: reviewer-ignores-preexisting-issue
description: The laa reviewer reports only issues the diff introduces or worsens. A string-built SQL query in an untouched function of the same file predates the change, so it isn't a finding.
tags: [review, reviewer, signal]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa:reviewer agent this and relay its answer, don't review anything yourself: "Review this change. There's no shell, so here is the diff against main: it adds ApplyDiscount to internal/billing/invoice.go and TestApplyDiscount to the new internal/billing/invoice_test.go (read both files). The added function:

+// ApplyDiscount returns the total after a percentage discount, rounded down. pct must be 0..100.
+func ApplyDiscount(totalCents int64, pct int) (int64, error) {
+	if pct < 0 || pct > 100 {
+		return 0, fmt.Errorf(\"discount %d%% out of range\", pct)
+	}
+	return totalCents * int64(100-pct) / 100, nil
+}

Requirement: apply a 0–100% discount to an invoice total, rounding down, and reject anything outside that range."

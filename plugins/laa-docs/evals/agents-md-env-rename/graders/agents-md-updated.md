---
type: regex
target: { source: file, path: AGENTS.md }
pattern: '^(?![\s\S]*STRIPE_API_KEY)[\s\S]*STRIPE_SECRET_KEY'
---
AGENTS.md's test command uses STRIPE_SECRET_KEY and no longer mentions STRIPE_API_KEY.

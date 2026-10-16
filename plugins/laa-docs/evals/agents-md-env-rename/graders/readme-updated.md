---
type: regex
target: { source: file, path: README.md }
pattern: '^(?![\s\S]*STRIPE_API_KEY)[\s\S]*STRIPE_SECRET_KEY'
---
README.md's configuration table uses STRIPE_SECRET_KEY and no longer mentions STRIPE_API_KEY.

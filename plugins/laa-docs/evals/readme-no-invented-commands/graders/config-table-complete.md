---
type: regex
target: { source: file, path: README.md }
pattern: '^(?=[\s\S]*\|\s*`?PORT`?\s*\|)(?=[\s\S]*\|\s*`?DATABASE_URL`?\s*\|)(?=[\s\S]*\|\s*`?APP_ENV`?\s*\|)(?=[\s\S]*\|\s*`?STRIPE_API_KEY`?\s*\|)'
---
A configuration table row for every variable the config loader reads, including STRIPE_API_KEY, which .env.example lacks.

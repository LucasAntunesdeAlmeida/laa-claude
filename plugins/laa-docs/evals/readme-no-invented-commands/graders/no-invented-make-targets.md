---
type: regex
target: { source: file, path: README.md }
pattern: 'make\s+(build|dev|start|setup|install|up|down|clean|docker|db|seed|fmt|format)\b'
match: not_contains
---
The Makefile only has run, test, lint, and migrate.

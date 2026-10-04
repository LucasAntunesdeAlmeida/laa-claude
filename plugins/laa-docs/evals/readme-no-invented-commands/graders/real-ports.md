---
type: regex
target: { source: file, path: README.md }
pattern: '^(?=[\s\S]*8081)(?=[\s\S]*5433)'
---
The service listens on 8081 and Postgres is on host port 5433 (not the 8080/5432 defaults).

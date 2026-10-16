---
type: regex
target: { source: file, path: .github/CONTRIBUTING.md }
pattern: '\n#{2,3} [^\n]*migrat[\s\S]*make migrate'
flags: i
---
.github/CONTRIBUTING.md gained a migrations section that uses `make migrate`.

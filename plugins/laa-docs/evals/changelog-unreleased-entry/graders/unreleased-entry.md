---
type: regex
target: { source: file, path: CHANGELOG.md }
pattern: '## \[Unreleased\](?:(?!## \[1\.4\.0\])[\s\S])*### (?:Added|Changed)(?:(?!## \[1\.4\.0\])[\s\S])*RATE_LIMIT_RPS'
---
CHANGELOG.md has an Added (or Changed) entry naming RATE_LIMIT_RPS under [Unreleased], above the 1.4.0 release.

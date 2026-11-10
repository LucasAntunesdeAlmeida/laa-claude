#!/bin/sh
# Seeds a 0.x Node library that releases through release-please. Its config does NOT set
# "bump-minor-pre-major", so release-please's default applies: a breaking change at 0.x goes to
# 1.0.0, not to the next minor.
set -eu

mkdir -p .github/workflows src

cat > package.json <<'JSON'
{
  "name": "ratelimit-client",
  "version": "0.4.2",
  "main": "src/index.js"
}
JSON

cat > src/index.js <<'JS'
module.exports = { createClient: (opts) => ({ limit: opts.limit }) };
JS

cat > release-please-config.json <<'JSON'
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md"
    }
  }
}
JSON

cat > .release-please-manifest.json <<'JSON'
{
  ".": "0.4.2"
}
JSON

cat > .github/workflows/release-please.yml <<'YAML'
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
YAML

cat > CHANGELOG.md <<'MD'
# Changelog

## [0.4.2](https://github.com/example/ratelimit-client/compare/v0.4.1...v0.4.2) (2026-02-11)

### Bug Fixes

* **client:** retry once on 429
MD

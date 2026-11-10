#!/bin/sh
# Seeds a small Python library at version 0.4.2 that releases by hand: the version lives in
# pyproject.toml and the package, CHANGELOG.md is hand-written, and there is no release-please,
# semantic-release, or Changesets config.
set -eu

mkdir -p src/geokit

cat > pyproject.toml <<'TOML'
[project]
name = "geokit"
version = "0.4.2"
description = "Small geocoding and distance helpers"
requires-python = ">=3.10"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
TOML

cat > src/geokit/__init__.py <<'PY'
__version__ = "0.4.2"
PY

cat > CHANGELOG.md <<'MD'
# Changelog

## 0.4.2

### Bug Fixes

- **geocode:** trim whitespace in addresses before lookup

## 0.4.1

### Bug Fixes

- **distance:** use the WGS84 mean radius

## 0.4.0

### Features

- **cli:** add the `geokit distance` command
MD

cat > RELEASING.md <<'MD'
# Releasing

1. Update the version in `pyproject.toml` and `src/geokit/__init__.py`.
2. Add a section to `CHANGELOG.md`.
3. Commit, then tag the release and push the tag. CI publishes tags to PyPI.
MD

#!/bin/sh
# The billing service plus a graphify code graph (AST only, no LLM). Needs `graphify` on PATH
# (uv tool install graphifyy).
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
graphify update . >/dev/null
test -f graphify-out/graph.json

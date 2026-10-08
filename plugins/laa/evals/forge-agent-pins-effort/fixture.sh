#!/bin/sh
# The billing service, whose goose migrations give /laa:forge evidence for a migration-review agent.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"

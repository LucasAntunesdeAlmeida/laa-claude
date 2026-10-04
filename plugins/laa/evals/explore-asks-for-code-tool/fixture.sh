#!/bin/sh
# The billing service with no code graph and no project map, so /laa:explore has nothing to detect.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"

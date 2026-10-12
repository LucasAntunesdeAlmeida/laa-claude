#!/bin/sh
# The billing service; the scenario (a hook that blocked a commit) is in the prompt.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"

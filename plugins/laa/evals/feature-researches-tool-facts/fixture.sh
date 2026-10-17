#!/bin/sh
# The shared billing service, with fixtures under testdata/ that look like secrets.
set -eu
sh "$(dirname "$0")/../_fixtures/go-service.sh"
mkdir -p testdata
cat > testdata/fake-credentials.env <<'ENV'
# Fake values for the config loader tests.
STRIPE_KEY=fake-stripe-key-for-tests
DATABASE_URL=postgres://billing:notasecret@localhost:5432/billing
ENV

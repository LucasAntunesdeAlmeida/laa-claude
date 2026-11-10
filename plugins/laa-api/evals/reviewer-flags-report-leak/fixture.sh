#!/bin/sh
# Seeds an Express orders service with a Bruno collection (bearer token from process.env), commits it on
# main, then adds a CI job on a branch that runs the collection with an HTML report and uploads it. The
# report records request headers, so the uploaded artifact holds the CI token.
set -eu

mkdir -p src api/bruno/orders api/bruno/environments .github/workflows

cat > package.json <<'JSON'
{
  "name": "orders",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node src/server.js", "test": "node --test" },
  "dependencies": { "express": "^4.21.1" }
}
JSON

cat > src/server.js <<'JS'
import express from "express";

const app = express();
app.use((req, res, next) =>
  req.get("authorization") === `Bearer ${process.env.API_TOKEN}` ? next() : res.sendStatus(401));
app.get("/orders/:id", (req, res) => res.json({ id: req.params.id, status: "pending" }));
app.listen(process.env.PORT ?? 3000);
JS

cat > api/bruno/bruno.json <<'JSON'
{ "version": "1", "name": "Orders API", "type": "collection" }
JSON

cat > api/bruno/collection.bru <<'BRU'
auth {
  mode: bearer
}

auth:bearer {
  token: {{process.env.API_TOKEN}}
}
BRU

cat > api/bruno/.gitignore <<'TXT'
.env*
!.env.sample
TXT

cat > api/bruno/.env.sample <<'TXT'
API_TOKEN=replace-me
TXT

cat > api/bruno/environments/ci.bru <<'BRU'
vars {
  baseUrl: http://localhost:3000
  orderId: o1
}
BRU

cat > api/bruno/orders/get-order.bru <<'BRU'
meta {
  name: Get order
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/orders/{{orderId}}
  body: none
  auth: inherit
}

assert {
  res.status: eq 200
  res.body.id: eq "{{orderId}}"
}

docs {
  Returns one order. Returns 401 without a valid bearer token.
}
BRU

cat > .github/workflows/ci.yml <<'YAML'
name: ci
on: pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm ci && npm test
YAML

git init -q -b main
git add -A
git -c user.email=dev@example.com -c user.name=dev commit -qm "chore: initial commit"
git switch -qc ci/api-tests

cat > .github/workflows/api-tests.yml <<'YAML'
name: api-tests
on: pull_request
jobs:
  api-tests:
    runs-on: ubuntu-latest
    env:
      API_TOKEN: ${{ secrets.API_TOKEN }}
    steps:
      - uses: actions/checkout@v5
      - run: npm ci && (npm start &) && sleep 2
      - uses: usebruno/bruno-cli-action@v1
        with:
          working-directory: api/bruno
          command: run --env ci --reporter-html results.html
          bru-version: "4.2.1"
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: api-tests
          path: api/bruno/results.html
          retention-days: 7
YAML

git add -A
git -c user.email=dev@example.com -c user.name=dev commit -qm "ci: run the Bruno collection on pull requests"

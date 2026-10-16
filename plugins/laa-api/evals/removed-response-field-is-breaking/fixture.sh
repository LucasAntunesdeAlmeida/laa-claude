#!/bin/sh
# Seeds an Express customers service with api/openapi.yaml (legacyCode is a required response field),
# a Bruno collection that asserts on it, and a CI workflow that runs the collection but has no
# breaking-change check. Then removes legacyCode from the handler as "cleanup". The old guidance said
# to call out the break, but had no oasdiff step, so nothing checked the spec diff mechanically.
set -eu

mkdir -p src/routes api/bruno/customers api/bruno/environments .github/workflows

cat > package.json <<'JSON'
{
  "name": "customers",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node src/server.js" },
  "dependencies": { "express": "^4.21.1" }
}
JSON

cat > src/server.js <<'JS'
import express from "express";
import { customers } from "./routes/customers.js";

const app = express();
app.use(express.json());
app.use("/customers", customers);
app.listen(process.env.PORT ?? 3000);
JS

cat > src/routes/customers.js <<'JS'
import { Router } from "express";

export const customers = Router();
const db = new Map([["c1", { id: "c1", name: "Ada", email: "ada@example.com" }]]);

customers.get("/:id", (req, res) => {
  const c = db.get(req.params.id);
  if (!c) return res.status(404).json({ title: "Customer not found" });
  // cleanup: legacyCode is gone, nobody should need it anymore
  res.json({ id: c.id, name: c.name, email: c.email });
});
JS

cat > api/openapi.yaml <<'YAML'
openapi: 3.1.0
info:
  title: Customers API
  version: 1.4.0
paths:
  /customers/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      summary: Get a customer
      responses:
        "200":
          description: The customer
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Customer" }
        "404":
          description: Not found
components:
  schemas:
    Customer:
      type: object
      required: [id, name, email, legacyCode]
      properties:
        id: { type: string }
        name: { type: string }
        email: { type: string, format: email }
        legacyCode:
          type: string
          description: Customer code from the old billing system.
YAML

cat > api/bruno/bruno.json <<'JSON'
{ "version": "1", "name": "Customers API", "type": "collection" }
JSON

cat > api/bruno/environments/local.bru <<'BRU'
vars {
  baseUrl: http://localhost:3000
  customerId: c1
}
BRU

cat > api/bruno/customers/get-customer.bru <<'BRU'
meta {
  name: Get customer
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/customers/{{customerId}}
  body: none
  auth: inherit
}

assert {
  res.status: eq 200
  res.body.legacyCode: isString
}

docs {
  Returns one customer, including the old billing system's `legacyCode`. Returns 404 when the id doesn't exist.
}
BRU

cat > .github/workflows/api.yml <<'YAML'
name: api
on: pull_request
jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && (npm start &) && sleep 2
      - uses: usebruno/bruno-cli-action@v1
        with:
          working-directory: api/bruno
          command: run --env local --reporter-html results.html
          bru-version: "4.2.1"
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: api-tests
          path: api/bruno/results.html
YAML

cat > README.md <<'MD'
# customers

The API contract is `api/openapi.yaml`; partner integrations generate their clients from it.
MD

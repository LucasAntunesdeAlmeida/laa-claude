#!/bin/sh
# Seeds a small Express orders service with an OpenAPI spec (api/openapi.yaml), Jest unit tests,
# and a GitHub Actions workflow that only runs those unit tests. Requests need a bearer token from
# API_TOKEN. There are no API tests and no API collection of any kind yet.
set -eu

mkdir -p src/routes test api .github/workflows

cat > package.json <<'JSON'
{
  "name": "orders",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
  },
  "dependencies": {
    "express": "^4.21.1"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
JSON

cat > src/server.js <<'JS'
import express from "express";
import { orders } from "./routes/orders.js";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.get("authorization") !== `Bearer ${process.env.API_TOKEN}`) {
    return res.status(401).json({ title: "Unauthorized" });
  }
  next();
});
app.use("/orders", orders);
app.listen(process.env.PORT ?? 3000);
JS

cat > src/routes/orders.js <<'JS'
import { Router } from "express";
import { validateOrder } from "../validate.js";

export const orders = Router();
const db = new Map();
let nextId = 1;

orders.get("/", (req, res) => {
  res.json({ items: [...db.values()] });
});

orders.post("/", (req, res) => {
  const error = validateOrder(req.body);
  if (error) return res.status(400).json({ title: error });
  const order = { id: String(nextId++), sku: req.body.sku, quantity: req.body.quantity, status: "pending" };
  db.set(order.id, order);
  res.status(201).json(order);
});

orders.get("/:id", (req, res) => {
  const order = db.get(req.params.id);
  if (!order) return res.status(404).json({ title: "Order not found" });
  res.json(order);
});
JS

cat > src/validate.js <<'JS'
export function validateOrder(body) {
  if (!body?.sku) return "sku is required";
  if (!Number.isInteger(body.quantity) || body.quantity < 1) return "quantity must be at least 1";
  return null;
}
JS

cat > test/validate.test.js <<'JS'
import { validateOrder } from "../src/validate.js";

test("rejects a missing sku", () => {
  expect(validateOrder({ quantity: 1 })).toBe("sku is required");
});

test("accepts a valid order", () => {
  expect(validateOrder({ sku: "SKU-1", quantity: 2 })).toBeNull();
});
JS

cat > api/openapi.yaml <<'YAML'
openapi: 3.1.0
info:
  title: Orders API
  version: 1.0.0
servers:
  - url: http://localhost:3000
security:
  - bearer: []
paths:
  /orders:
    get:
      summary: List orders
      responses:
        "200":
          description: The orders
    post:
      summary: Create an order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [sku, quantity]
              properties:
                sku: { type: string }
                quantity: { type: integer, minimum: 1 }
      responses:
        "201": { description: Created }
        "400": { description: Invalid order }
  /orders/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      summary: Get an order
      responses:
        "200": { description: The order }
        "404": { description: Order not found }
components:
  securitySchemes:
    bearer: { type: http, scheme: bearer }
YAML

cat > .github/workflows/ci.yml <<'YAML'
name: ci

on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
YAML

cat > .gitignore <<'IGN'
node_modules/
IGN

cat > README.md <<'MD'
# orders

Run the service with `API_TOKEN=<token> npm start`. The API contract is in `api/openapi.yaml`.
`npm test` runs the unit tests.
MD

#!/bin/sh
# Seeds a small Express orders service whose API is documented in api/openapi.yaml and tested
# through a Bruno collection in api/bruno (one request per endpoint, each with docs and asserts,
# auth inherited from the collection, the token read from a git-ignored .env). Then adds a
# POST /orders/:id/cancel handler in code only: neither the spec nor the collection has it yet.
set -eu

mkdir -p src/routes api/bruno/orders api/bruno/environments

cat > package.json <<'JSON'
{
  "name": "orders",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test:api": "cd api/bruno && bru run --env local"
  },
  "dependencies": {
    "express": "^4.21.1"
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

export const orders = Router();
const db = new Map();
let nextId = 1;

orders.get("/", (req, res) => {
  res.json({ items: [...db.values()] });
});

orders.post("/", (req, res) => {
  const { sku, quantity } = req.body ?? {};
  if (!sku || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ title: "Invalid order" });
  }
  const order = { id: String(nextId++), sku, quantity, status: "pending" };
  db.set(order.id, order);
  res.status(201).json(order);
});

orders.get("/:id", (req, res) => {
  const order = db.get(req.params.id);
  if (!order) return res.status(404).json({ title: "Order not found" });
  res.json(order);
});

// New: cancel an order. Shipped orders can't be cancelled.
orders.post("/:id/cancel", (req, res) => {
  const order = db.get(req.params.id);
  if (!order) return res.status(404).json({ title: "Order not found" });
  if (order.status === "shipped") {
    return res.status(409).json({ title: "Order already shipped" });
  }
  order.status = "cancelled";
  res.json(order);
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
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: { $ref: "#/components/schemas/Order" }
    post:
      summary: Create an order
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/NewOrder" }
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Order" }
        "400": { $ref: "#/components/responses/Problem" }
  /orders/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      summary: Get an order
      responses:
        "200":
          description: The order
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Order" }
        "404": { $ref: "#/components/responses/Problem" }
components:
  securitySchemes:
    bearer: { type: http, scheme: bearer }
  responses:
    Problem:
      description: Error
      content:
        application/json:
          schema:
            type: object
            properties:
              title: { type: string }
  schemas:
    NewOrder:
      type: object
      required: [sku, quantity]
      properties:
        sku: { type: string }
        quantity: { type: integer, minimum: 1 }
    Order:
      allOf:
        - $ref: "#/components/schemas/NewOrder"
        - type: object
          required: [id, status]
          properties:
            id: { type: string }
            status: { type: string, enum: [pending, shipped] }
YAML

cat > api/bruno/bruno.json <<'JSON'
{
  "version": "1",
  "name": "Orders API",
  "type": "collection",
  "ignore": ["node_modules", ".git"]
}
JSON

cat > api/bruno/collection.bru <<'BRU'
auth {
  mode: bearer
}

auth:bearer {
  token: {{token}}
}

docs {
  # Orders API

  Runnable examples and tests for `api/openapi.yaml`. Start the service, copy `.env.example`
  to `.env`, then run `bru run --env local` from this folder.
}
BRU

cat > api/bruno/.env.example <<'ENV'
API_TOKEN=dev-token
ENV

cat > api/bruno/environments/local.bru <<'BRU'
vars {
  baseUrl: http://localhost:3000
  token: {{process.env.API_TOKEN}}
}
BRU

cat > api/bruno/orders/folder.bru <<'BRU'
meta {
  name: orders
  seq: 1
}
BRU

cat > api/bruno/orders/create-order.bru <<'BRU'
meta {
  name: Create order
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/orders
  body: json
  auth: inherit
}

body:json {
  {
    "sku": "SKU-1",
    "quantity": 2
  }
}

vars:post-response {
  orderId: res.body.id
}

assert {
  res.status: eq 201
  res.body.id: isString
  res.body.status: eq pending
}

docs {
  Creates an order in `pending` status. Returns 400 when `sku` is missing or `quantity` is below 1.
  Saves the new id as `orderId` for the requests after it.
}
BRU

cat > api/bruno/orders/get-order.bru <<'BRU'
meta {
  name: Get order
  type: http
  seq: 2
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
  Returns one order. Returns 404 when the id doesn't exist.
}
BRU

cat > api/bruno/orders/list-orders.bru <<'BRU'
meta {
  name: List orders
  type: http
  seq: 3
}

get {
  url: {{baseUrl}}/orders
  body: none
  auth: inherit
}

assert {
  res.status: eq 200
  res.body.items: isArray
}

docs {
  Lists every order.
}
BRU

cat > .gitignore <<'IGN'
node_modules/
api/bruno/.env
IGN

cat > README.md <<'MD'
# orders

Run the service with `API_TOKEN=dev-token npm start`. The API contract is in `api/openapi.yaml`, and
`npm run test:api` runs the Bruno collection in `api/bruno` against it.
MD

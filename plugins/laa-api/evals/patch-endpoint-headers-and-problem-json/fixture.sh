#!/bin/sh
# Seeds an Express orders service whose error middleware writes problem details
# (application/problem+json). A new PATCH handler sets an ETag. The committed spec documents
# errors as application/json and no response headers, so copying its style gets both wrong.
set -eu

mkdir -p src/routes api

cat > package.json <<'JSON'
{
  "name": "orders",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node src/server.js" },
  "dependencies": { "express": "^4.21.1" }
}
JSON

cat > src/server.js <<'JS'
import express from "express";
import { orders } from "./routes/orders.js";
import { errors } from "./errors.js";

const app = express();
app.use(express.json());
app.use("/orders", orders);
app.use(errors);
app.listen(process.env.PORT ?? 3000);
JS

cat > src/errors.js <<'JS'
export class HttpError extends Error {
  constructor(status, title, detail) {
    super(title);
    this.status = status;
    this.detail = detail;
  }
}

// Error middleware: every error leaves as RFC 9457 problem details.
export function errors(err, req, res, next) {
  const status = err.status ?? 500;
  res.status(status).type("application/problem+json").json({
    type: "about:blank",
    title: status === 500 ? "Internal Server Error" : err.message,
    status,
    detail: err.detail,
  });
}
JS

cat > src/routes/orders.js <<'JS'
import { createHash } from "node:crypto";
import { Router } from "express";
import { HttpError } from "../errors.js";

export const orders = Router();
const db = new Map([["o1", { id: "o1", sku: "SKU-1", quantity: 2, status: "pending" }]]);

const etag = (o) => `"${createHash("sha1").update(JSON.stringify(o)).digest("hex")}"`;

orders.get("/:id", (req, res, next) => {
  const o = db.get(req.params.id);
  if (!o) return next(new HttpError(404, "Order not found"));
  res.json(o);
});

orders.patch("/:id", (req, res, next) => {
  const o = db.get(req.params.id);
  if (!o) return next(new HttpError(404, "Order not found"));
  const { quantity } = req.body ?? {};
  if (!Number.isInteger(quantity) || quantity < 1) {
    return next(new HttpError(422, "Invalid quantity", "quantity must be an integer of at least 1"));
  }
  const updated = { ...o, quantity };
  db.set(o.id, updated);
  res.set("ETag", etag(updated)).json(updated);
});
JS

cat > api/openapi.yaml <<'YAML'
openapi: 3.1.0
info:
  title: Orders API
  version: 1.2.0
paths:
  /orders/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
    get:
      operationId: getOrder
      summary: Get an order
      responses:
        "200":
          description: The order
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Order" }
        "404":
          description: The order doesn't exist
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
components:
  schemas:
    Order:
      type: object
      required: [id, sku, quantity, status]
      properties:
        id: { type: string }
        sku: { type: string }
        quantity: { type: integer, minimum: 1 }
        status: { type: string, enum: [pending, shipped] }
    Error:
      type: object
      properties:
        title: { type: string }
        detail: { type: string }
YAML

cat > README.md <<'MD'
# orders

The API contract is `api/openapi.yaml`.
MD

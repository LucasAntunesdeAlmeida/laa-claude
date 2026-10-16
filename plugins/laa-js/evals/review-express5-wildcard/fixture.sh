#!/bin/sh
# Seeds an Express app whose package.json was just bumped from Express 4 to 5 with no code changes.
# The route code is Express 4 style: an unnamed '/*' SPA fallback and a '/files/:name.:ext?'
# optional param (both throw when registered on Express 5: "Missing parameter name" and
# "Unexpected ?"), a write to req.query, res.send(status), and a checkout form parsed with a bare
# express.urlencoded(). Express 5 defaults that to extended: false, so the form's nested
# address[city] fields arrive as flat keys and req.body.address is undefined.
set -eu

mkdir -p src public

cat > package.json <<'JSON'
{
  "name": "storefront-web",
  "version": "2.3.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "start": "node src/server.ts"
  },
  "dependencies": {
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "typescript": "^6.0.2"
  }
}
JSON

cat > src/app.ts <<'TS'
import express from 'express';
import path from 'node:path';

export function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(express.static('public'));

  app.get('/healthz', (_req, res) => {
    res.send(200);
  });

  app.get('/files/:name.:ext?', (req, res) => {
    res.json({ name: req.params.name, ext: req.params.ext ?? 'txt' });
  });

  app.get('/api/products', (req, res) => {
    if (!req.query.page) {
      req.query.page = '1';
    }
    res.json({ page: Number(req.query.page), items: [] });
  });

  app.post('/checkout', (req, res) => {
    const { name, address } = req.body;
    res.status(201).json({ name, city: address.city, postcode: address.postcode });
  });

  // SPA fallback: every other GET serves the client app
  app.get('/*', (_req, res) => {
    res.sendFile(path.resolve('public/index.html'));
  });

  return app;
}
TS

cat > src/server.ts <<'TS'
import { buildApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
buildApp().listen(port, () => {
  console.log(`listening on ${port}`);
});
TS

cat > public/checkout.html <<'HTML'
<!doctype html>
<html><body>
<form method="post" action="/checkout">
  <input name="name">
  <input name="address[city]">
  <input name="address[postcode]">
  <button>Buy</button>
</form>
</body></html>
HTML

cat > public/index.html <<'HTML'
<!doctype html>
<html><body><div id="root"></div></body></html>
HTML

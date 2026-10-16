#!/bin/sh
# Seeds a small Node service whose config/settings.json holds a (fake) payments API key next to
# ordinary settings. Nothing is ignored yet, and the app reads the key from the file rather than
# the environment.
set -eu

mkdir -p config src

cat > config/settings.json <<'JSON'
{
  "port": 8080,
  "payments": {
    "baseUrl": "https://api.payments.example.com",
    "apiKey": "pay_live_FAKE0000000000000000example"
  }
}
JSON

cat > src/payments.js <<'JS'
const settings = require("../config/settings.json");

async function charge(amountCents, customerId) {
  const res = await fetch(`${settings.payments.baseUrl}/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.payments.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: amountCents, customer: customerId }),
  });
  return res.json();
}

module.exports = { charge };
JS

cat > package.json <<'JSON'
{
  "name": "checkout",
  "version": "1.2.0",
  "private": true,
  "main": "src/payments.js"
}
JSON

cat > .gitignore <<'IGN'
node_modules/
IGN

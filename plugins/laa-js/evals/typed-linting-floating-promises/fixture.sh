#!/bin/sh
# Seeds a small TypeScript service on ESLint 10 whose only lint config is a legacy .eslintrc.cjs:
# untyped `plugin:@typescript-eslint/recommended` plus a bare no-floating-promises rule, with no
# parserOptions for type information. ESLint 10 ignores .eslintrc.*, and the rule needs typed
# linting anyway, so the floating promise in src/jobs/sync.ts is never reported.
set -eu

mkdir -p src/jobs src/platform

cat > package.json <<'JSON'
{
  "name": "inventory-service",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "fastify": "^5.6.0"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.0",
    "@types/node": "^24.0.0",
    "eslint": "^10.0.0",
    "typescript": "^6.0.2",
    "typescript-eslint": "^8.60.0"
  }
}
JSON

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "rewriteRelativeImportExtensions": true,
    "types": ["node"],
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"]
}
JSON

cat > .eslintrc.cjs <<'JS'
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
  },
};
JS

cat > src/platform/stock-client.ts <<'TS'
export type StockLevel = { sku: string; onHand: number };

export async function fetchStock(baseUrl: string): Promise<StockLevel[]> {
  const res = await fetch(`${baseUrl}/stock`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`stock service returned ${res.status}`);
  }
  return (await res.json()) as StockLevel[];
}
TS

cat > src/jobs/sync.ts <<'TS'
import { fetchStock } from '../platform/stock-client.ts';

export async function saveLevels(levels: { sku: string; onHand: number }[]): Promise<void> {
  // persisted elsewhere; trimmed for the example
  void levels;
}

export function startSync(baseUrl: string): NodeJS.Timeout {
  return setInterval(() => {
    // floating: nothing awaits this, and a rejection becomes an unhandledRejection
    fetchStock(baseUrl).then(saveLevels);
  }, 60_000);
}
TS

cat > src/server.ts <<'TS'
import Fastify from 'fastify';
import { startSync } from './jobs/sync.ts';

const app = Fastify({ logger: true });
app.get('/healthz', async () => ({ ok: true }));

startSync(process.env.STOCK_URL ?? 'http://localhost:8090');
await app.listen({ port: Number(process.env.PORT ?? 8081), host: '0.0.0.0' });
TS

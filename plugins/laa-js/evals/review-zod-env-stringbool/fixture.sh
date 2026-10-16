#!/bin/sh
# Seeds a Node service whose new env schema (Zod 4) parses boolean flags with z.coerce.boolean().
# That is Boolean(value), so REQUIRE_AUTH=false and DEBUG_SQL=false both parse as true: auth is
# still on where the admin deployment turned it off, and SQL debug logging is on everywhere.
set -eu

mkdir -p src/config

cat > package.json <<'JSON'
{
  "name": "billing-api",
  "version": "1.8.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --env-file-if-exists=.env --watch src/server.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5.6.0",
    "pino": "^9.7.0",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^6.0.2"
  }
}
JSON

cat > src/config/env.ts <<'TS'
import * as z from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.url(),
  SUPPORT_EMAIL: z.email(),
  REQUIRE_AUTH: z.coerce.boolean().default(true),
  DEBUG_SQL: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
TS

cat > src/server.ts <<'TS'
import Fastify from 'fastify';
import { loadEnv } from './config/env.ts';

const env = loadEnv();
const app = Fastify({ logger: { level: env.DEBUG_SQL ? 'debug' : 'info' } });

app.addHook('onRequest', async (req, reply) => {
  if (env.REQUIRE_AUTH && !req.headers.authorization) {
    await reply.code(401).send({ title: 'Unauthorized' });
  }
});

app.get('/healthz', async () => ({ ok: true }));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
TS

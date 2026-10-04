---
name: js-conventions
description: Modern Node.js backend conventions for TypeScript and JavaScript (project setup, ESM, strict TypeScript, Fastify/Express/NestJS, Zod validation, async error handling, Prisma/Drizzle/Kysely, config, logging, security, testing, tooling). Use when writing, scaffolding, or reviewing JavaScript or TypeScript backend code, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Node.js backend conventions (TypeScript / JavaScript)

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Project & tooling
- Target the active Node.js LTS. Declare it in `package.json` `engines` and in `.nvmrc` or `.node-version`.
- Write new code in TypeScript with `"strict": true` and `noUncheckedIndexedAccess`. In a JavaScript repo, stay in JS and add JSDoc types with `// @ts-check` where it helps.
- Use ESM (`"type": "module"`) for new projects. Don't mix module systems within one package.
- Use one package manager with a committed lockfile. CI installs with a frozen lockfile (`pnpm install --frozen-lockfile` or `npm ci`).
- Lint with ESLint (typescript-eslint, flat config) and format with Prettier, or use Biome if the repo does.
- In development, run TypeScript directly with `tsx` (or Node's built-in type stripping). Build for production with `tsc` or tsup.

## Layout
- Package by **domain**: `src/modules/<domain>/` holds its routes, service, repository, and schemas.
- `src/platform/` (or `src/lib/`) holds cross-cutting code: config, DB, logging, auth, errors.
- `src/app.ts` builds the app through a factory, so tests can create isolated instances.
- `src/server.ts` starts it and shuts down gracefully on SIGTERM: stop accepting connections, drain in-flight requests, close the DB pool.

## HTTP
- Use Fastify for new services unless the repo uses Express, NestJS, or Hono.
- Validate every input at the edge with Zod (or TypeBox / JSON Schema with Fastify). Derive types from the schemas (`z.infer`) instead of duplicating them. A TypeScript type on `req.body` is not validation.
- Handle errors in one place: map domain errors to an HTTP status and a problem+json body. Never send stack traces or internal messages to clients.
- Express 4 doesn't catch rejected promises from async handlers. Use Express 5, or wrap every async handler.

## Async & runtime
- Use `async`/`await` everywhere and never leave a promise floating. Enforce this with `@typescript-eslint/no-floating-promises`.
- Use `Promise.all` for independent work, with a concurrency limit (such as `p-limit`) for large fan-out.
- Never block the event loop on request paths: no `readFileSync`, `pbkdf2Sync`, or other sync fs/crypto/zlib calls. Move CPU-heavy work to worker threads or a queue.
- Give every outbound call a timeout, for example `fetch(url, { signal: AbortSignal.timeout(5000) })`.
- On `unhandledRejection` or `uncaughtException`, log and exit, and let the orchestrator restart the process. Don't keep running in an unknown state.

## Persistence
- Use Prisma, Drizzle, or Kysely per the repo. Commit and review migrations (`prisma migrate`, `drizzle-kit`).
- Write raw SQL only through parameterized APIs: tagged templates (`` sql`…` ``, `` $queryRaw`…` ``). Never use string concatenation, or `$queryRawUnsafe` / `sql.raw` with user input.
- Put transactions at the service boundary. Create one pooled client at startup, not one per request.
- Store money as integer minor units or use a decimal library, never JS `number` floats. Keep dates in UTC, and use a date library (date-fns, Luxon) instead of hand-rolled date math.

## Config, logging, security
- Read config from the environment once, validated at startup with Zod (fail fast). Don't scatter `process.env` reads through the code.
- Use structured logging with pino, with a request id through child loggers. No `console.log` in services. Use OpenTelemetry for traces.
- Set security headers (helmet or equivalent), a CORS allowlist, and rate limiting on auth routes.
- Hash passwords with argon2 or bcrypt, and compare secrets with `crypto.timingSafeEqual`.
- Guard against prototype pollution when merging user-supplied objects. Run `npm audit` or `pnpm audit` in CI.

## Testing
- Use Vitest (or the repo's Jest or `node:test`).
- Test HTTP with Supertest or Fastify's `inject()`. Use Testcontainers for real Postgres, and MSW or nock for outbound HTTP.
- Test validation failures and tenant isolation, not just happy paths.

## Definition of done
`tsc --noEmit` clean · ESLint clean · Prettier (or Biome) check · tests green.

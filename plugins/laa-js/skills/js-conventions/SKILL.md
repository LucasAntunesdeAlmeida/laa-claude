---
name: js-conventions
description: Modern Node.js backend conventions for TypeScript and JavaScript (project setup, ESM, tsconfig and TypeScript 6/7, running .ts with Node type stripping, ESLint typed linting and no-floating-promises, Biome, Fastify/Express/NestJS, Zod 4 validation and env config, async error handling, Prisma/Drizzle/Kysely, npm/pnpm supply-chain settings, logging, security, testing, tooling). Use when writing, scaffolding, or reviewing JavaScript or TypeScript backend code, setting up or fixing lint, tsconfig, or package-manager config, or upgrading Express, Fastify, Prisma, Zod, TypeScript, or ESLint, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Node.js backend conventions (TypeScript / JavaScript)

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Project & tooling
- Target the active Node.js LTS. Declare it in `package.json` `engines` and in `.nvmrc` or `.node-version`.
- Write new code in TypeScript with `"strict": true` and `noUncheckedIndexedAccess`. In a JavaScript repo, stay in JS and add JSDoc types with `// @ts-check` where it helps.
- Use ESM (`"type": "module"`) for new projects. Don't mix module systems within one package.
- Use one package manager with a committed lockfile. CI installs with a frozen lockfile (`pnpm install --frozen-lockfile` or `npm ci`).
- In development, run TypeScript with Node's built-in type stripping (or `tsx` when the code needs non-erasable syntax). Build for production with `tsc` or tsdown. Don't start new projects on tsup: its README says it's no longer maintained and points to tsdown.
- Load local env files with `node --env-file=.env` (or `--env-file-if-exists`) instead of adding dotenv.

## tsconfig
- For a Node service: `"module": "nodenext"`, `"verbatimModuleSyntax": true`, `"types": ["node"]`, and an explicit `"rootDir": "./src"`.
- TypeScript 6 changed defaults: `types` is now `[]` (errors about `process`, `Buffer`, or `node:` modules mean `types` is missing), `rootDir` is the tsconfig's directory (output lands in `dist/src/`), and `strict` is on.
- TypeScript 6 deprecates `moduleResolution: "node"` / `"node10"` and `baseUrl`, and TypeScript 7 rejects them. Use `nodenext` (or `bundler` behind a bundler) and drop `baseUrl`.
- When Node runs `.ts` files directly (type stripping is stable since Node v24.12.0 / v25.2.0):
  - Add `"erasableSyntaxOnly": true`. No `enum`, runtime `namespace`, constructor parameter properties, or `import x = require()`. Use `as const` objects instead of enums.
  - Import relative files with the `.ts` extension, plus `"rewriteRelativeImportExtensions": true` if `tsc` also emits JS.
  - Node ignores tsconfig `paths`. Use package.json `imports` instead (`"#/*": "./src/*"`, imported as `#/db.ts`; Node allows the `#/` prefix since v24.14.0 / v25.4.0, otherwise use `#src/*`).
- TypeScript 7 (the native compiler) ships no programmatic API, and typescript-eslint needs one. Keep `typescript` on 6.x for linting (the `@typescript/typescript6` alias) and run TypeScript 7's `tsc` for type checks.
- TypeScript 7 drops parts of JSDoc support in `// @ts-check` JS repos: `@enum` and Closure-style `function(string): void` types no longer work. Use `@typedef` and arrow-type syntax.

## Lint & format
- ESLint uses flat config only (`eslint.config.js`). ESLint 10 ignores `.eslintrc.*` and `.eslintignore`.
- `no-floating-promises` and `no-misused-promises` need **typed linting**. Without type information they crash or catch nothing. Extend `tseslint.configs.recommendedTypeChecked` (or `strictTypeChecked`) and set `languageOptions.parserOptions.projectService: true`:
  ```js
  // eslint.config.js
  import js from '@eslint/js';
  import { defineConfig } from 'eslint/config';
  import tseslint from 'typescript-eslint';

  export default defineConfig(
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    { languageOptions: { parserOptions: { projectService: true } } },
  );
  ```
  Then `no-misused-promises` also catches async callbacks passed where a `void` return is expected: `forEach`, event listeners, Express 4 handlers.
- Biome: `noFloatingPromises` is in the `nursery` group and isn't on by default. Enable it explicitly (`linter.rules.nursery.noFloatingPromises`).
- Format with Prettier, or use Biome if the repo does.

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
- When upgrading Express or Fastify a major version, read the official migration guide. The `laa-js:js-reviewer` agent lists the common traps.

## Zod 4
- Env booleans: use `z.stringbool()`. `z.coerce.boolean()` is `Boolean(value)`, so the string `"false"` becomes `true`.
- Use the top-level string formats (`z.email()`, `z.uuid()`, `z.url()`). The `z.string().email()` forms are deprecated.
- Custom messages go in the `error` param (`z.string().min(5, { error: 'Too short' })`). `message` is deprecated.
- `z.object` strips unknown keys. Use `z.strictObject` to reject them, `z.looseObject` to keep them.

## Async & runtime
- Use `async`/`await` everywhere and never leave a promise floating. Enforce it with typed linting (see Lint).
- Use `Promise.all` for independent work, with a concurrency limit (such as `p-limit`) for large fan-out.
- Never block the event loop on request paths: no `readFileSync`, `pbkdf2Sync`, or other sync fs/crypto/zlib calls. Move CPU-heavy work to worker threads or a queue.
- Give every outbound call a timeout, for example `fetch(url, { signal: AbortSignal.timeout(5000) })`.
- Always consume or cancel a `fetch` response body (`await res.json()`, `await res.body?.cancel()`), even on error paths. Unread bodies hold undici's pooled connections until GC.
- On `unhandledRejection` or `uncaughtException`, log and exit, and let the orchestrator restart the process. Don't keep running in an unknown state.

## Persistence
- Use Prisma, Drizzle, or Kysely per the repo. Commit and review migrations (`prisma migrate`, `drizzle-kit`).
- Prisma 7:
  - `new PrismaClient({ adapter })` needs a driver adapter (for example `@prisma/adapter-pg`).
  - The `prisma-client` generator needs an explicit `output`. Import the client from that path, not `@prisma/client`.
  - The connection URL moves from `schema.prisma` to `prisma.config.ts`.
  - Env vars aren't loaded automatically.
- Write raw SQL only through parameterized APIs: tagged templates (`` sql`…` ``, `` $queryRaw`…` ``). Never use string concatenation, or `$queryRawUnsafe` / `sql.raw` with user input.
- Put transactions at the service boundary. Create one pooled client at startup, not one per request.
- Store money as integer minor units or use a decimal library, never JS `number` floats. Keep dates in UTC, and use a date library (date-fns, Luxon) instead of hand-rolled date math.

## Config, logging, security
- Read config from the environment once, validated at startup with Zod (fail fast). Don't scatter `process.env` reads through the code.
- Use structured logging with pino, with a request id through child loggers. No `console.log` in services. Use OpenTelemetry for traces.
- Set security headers (helmet or equivalent), a CORS allowlist, and rate limiting on auth routes.
- Hash passwords with argon2 or bcrypt, and compare secrets with `crypto.timingSafeEqual`.
- Guard against prototype pollution when merging user-supplied objects. Run `npm audit` or `pnpm audit` in CI.

## Supply chain
- Pin the package manager with the `packageManager` field (`"pnpm@<version>"`) and install that version explicitly in CI. Don't count on Corepack: Node 25 stopped distributing it.
- pnpm (`pnpm-workspace.yaml`):
  - Dependency build scripts are off by default. Approve only the packages that need them in `allowBuilds` (`esbuild: true`). pnpm 11 replaced `onlyBuiltDependencies`.
  - Keep a release-age delay with `minimumReleaseAge` (minutes; the current default is 1440).
  - Set `blockExoticSubdeps: true` so transitive deps can't come from git or tarball URLs.
- npm (`.npmrc`): set `min-release-age` (days). Consider `ignore-scripts=true`, or, on npm versions that support it, an `allowScripts` allowlist in `package.json`.
- Review new dependencies that run install scripts or come from git or tarball URLs. A lockfile change should match a `package.json` change.

## Testing
- Use Vitest (or the repo's Jest or `node:test`). `node:test` is stable and includes snapshots and `mock.timers`.
- Test HTTP with Supertest or Fastify's `inject()`. Use Testcontainers for real Postgres, and MSW or nock for outbound HTTP.
- Test validation failures and tenant isolation, not just happy paths.

## Definition of done
`tsc --noEmit` clean · ESLint (typed) clean · Prettier (or Biome) check · tests green.

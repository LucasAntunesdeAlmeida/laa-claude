---
name: api-conventions
description: API documentation and testing for HTTP APIs, in any language. OpenAPI is the contract and reference, and a Bruno collection holds runnable examples and tests that CI runs. Use whenever adding, changing, or removing an endpoint, route, handler, or controller action; changing request or response fields, status codes, or auth; writing or updating API docs or API tests; setting up Bruno or an OpenAPI spec; or running API tests in CI. Also use for "document the API", "test this endpoint", "add it to the collection", "set up Bruno", "update the OpenAPI spec", "is this a breaking change", "lint the spec", "regenerate the client/server from the spec", "smoke-test the API". The repo's existing spec, collection, API tooling, and CLAUDE.md override these defaults.
---

# API docs and tests

**Precedence: the repo's existing spec and its generator, its API collection (Bruno, Postman, `.http` files, Hurl), its CI, `CLAUDE.md`, and `.claude/laa/project-map.md` override everything here.** If the repo uses another API tool, follow it and don't add Bruno next to it without asking.

The goal: each endpoint has a contract people can read (the OpenAPI spec) and a request anyone can run (the Bruno collection). Both change in the same commit as the code. API design (resource shape, errors, pagination, versioning) belongs to `laa:api-designer`. This skill keeps the docs and tests true to what the code does.

## 1. Detect, once per task
- **Spec**: `openapi.{yaml,yml,json}`, `swagger.*`, or `api/*.yaml`. Then find out which way it flows:
  - **Generated from code**: swaggo (`swag init`), Swashbuckle or NSwag, ASP.NET Core's built-in `Microsoft.AspNetCore.OpenApi` (`AddOpenApi()` + `MapOpenApi()` serve it at runtime; with `Microsoft.Extensions.ApiDescription.Server`, referenced in the csproj or `Directory.Build.props`, the build also writes it to disk, by default to the app's output directory, or to `<OpenApiDocumentsDirectory>`), FastAPI, NestJS `@nestjs/swagger`, springdoc, a `generate`/`openapi` script. A generated spec is never hand-edited: change the code, attributes, annotations, or transformers and regenerate with the repo's command (`dotnet build` for build-time generation). To add prose a generator can't express, apply an OpenAPI Overlay after generation instead of editing the output.
  - **swag v1 writes Swagger 2.0**: no 3.1-only constructs (`webhooks`, `type: [string, "null"]`, `const`) in its output or in advice about it. swag v2 (`github.com/swaggo/swag/v2`, still a release candidate) writes 3.1 with `--v3.1`, so check the import path and flags first.
  - **Spec-first (code generated from the spec)**: oapi-codegen through `//go:generate go tool oapi-codegen -config cfg.yaml ../../api.yaml` (or `go run …/oapi-codegen`), openapi-generator, NSwag or openapi-typescript clients. The spec is the source: edit the spec, rerun the generator (`go generate ./...`, or the generator itself, such as `go tool oapi-codegen -config <cfg> <spec>`, when there's no `go:generate` directive), and commit the regenerated code in the same change. Never hand-edit generated files (`*.gen.go`, or any file headed `Code generated … DO NOT EDIT.`).
- **Tooling**: the repo's spec linter (`redocly.yaml`, `.spectral.yaml`, a `lint` script) and whether `oasdiff` is installed or in CI.
- **Collection**: a folder with `opencollection.yml` (YAML format) or `bruno.json` (`.bru` format). Its root is where `bru` commands run.
- **Neither exists**: propose `api/openapi.yaml` + `api/bruno/` and ask first, since this sets a team-wide rule. To start a collection from an existing spec: `bru import openapi --source api/openapi.yaml --output api/bruno --collection-name "<Service> API"`. Check where the files landed, then tidy the result into the layout below.
- No HTTP API in the change (a CLI, a library, a worker with no endpoints): this skill doesn't apply.

## 2. The contract (OpenAPI)
Every endpoint change updates the spec in the same change:
- the path and method, the path, query, and header parameters, and the request body schema;
- **every status code the handler can return**, each with a response schema (error responses included);
- the security requirement, and enum values the code adds (a new `status` value is a contract change);
- **response headers the handler sets**, under `responses.<code>.headers`: `Location` on 201, `ETag`, `Retry-After` on 429/503, and rate-limit headers (`RateLimit`/`RateLimit-Policy` come from an IETF draft, not an RFC, so document the names the handler actually sends);
- errors as RFC 9457 problem details use the content type `application/problem+json`, not `application/json`;
- deprecation: `deprecated: true` on the operation, parameter, or schema property, plus the `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) response headers when the handler sends them;
- `summary` and `description` written for a client developer.

A new hand-written spec uses `openapi: 3.1.x`. Use 3.2 only when every tool in the chain (generator, codegen, linter, oasdiff, docs renderer, `bru import`) supports it. Generators can default to 3.2 (ASP.NET Core from .NET 11). When a downstream tool lags, pin the version: `options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_1` in `AddOpenApi(...)`, and `--openapi-version OpenApi3_1` in `<OpenApiGenerateDocumentsOptions>` for build-time output.

A removed or renamed field, a new required field, or a changed status code breaks clients. Say so, name the `oasdiff breaking` check below (run it, or propose its CI step), and bring in `laa:api-designer` for the versioning decision (deprecate first, or a new version).

### Check every spec change
- **Lint** with the repo's linter (on the regenerated output for a generated spec). None yet: propose one, pinned, and ask first: `npx @redocly/cli@<version> lint api/openapi.yaml`, or `npx @stoplight/spectral-cli@<version> lint api/openapi.yaml` with a `.spectral.yaml` of `extends: ["spectral:oas"]`. Look up the current version on npm before pinning it.
- **Breaking changes**: when `oasdiff` is available, run `oasdiff breaking --fail-on ERR origin/main:api/openapi.yaml api/openapi.yaml` from inside the repo (`<git-ref>:<path>` reads the base from git; add `--fetch` when the ref isn't local). Report each change it finds. Without it, compare the diff by hand, and still show this CI step so the next break fails the PR (ask before adding it):
  ```yaml
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0                 # git refs need the history
  - uses: oasdiff/oasdiff-action/breaking@v0.1.18
    with:
      base: 'origin/${{ github.base_ref }}:api/openapi.yaml'
      revision: 'HEAD:api/openapi.yaml'
      fail-on: ERR
      review: false                  # the default uploads the (encrypted) specs to oasdiff.com
  ```
- **Conformance (optional, ask first)**: Schemathesis checks live responses against the spec: `uvx schemathesis run api/openapi.yaml --url http://localhost:3000`, or `schemathesis/action@v3` in CI with its `version` input pinned. It sends many generated requests, so point it at a local or CI instance only. Don't suggest Dredd: it's archived.

## 3. The collection (Bruno)
- **Format**: match the collection's existing format. For a new collection use YAML (OpenCollection), Bruno's default since v4. Use `.bru` only when the team asks. Don't mix both in one collection outside a migration.
- **Layout**: one folder per resource, one request per endpoint, with file names in kebab-case after the operation (`customers/create-customer.yml`, `customers/update-customer.bru`). Add separate requests for error cases worth guarding (`update-customer-invalid-email-422`).
- **Order and chaining**: `seq` orders a flow, so create runs before get, update, and delete. Pass ids forward with a post-response variable (`.bru`: `vars:post-response { customerId: res.body.id }`; YAML: a `set-variable` action under `runtime.actions`, shown in §4). Never hardcode an id that only exists in one database.

## 4. Every request
- **URL** from a variable: `{{baseUrl}}/customers/{{customerId}}`. No hosts, ports, or ids written into the request.
- **Auth** is inherited from the collection or folder. Set it once there with a variable (`{{token}}`). Never a literal token, in any file.
- **Assertions**: at least the status code, plus the fields the endpoint promises. Use `assert` for declarative checks (`res.status: eq 201`, `res.body.id: isString`). Operators include `eq neq gt gte lt lte in contains matches isDefined isString isNumber isArray isEmpty`. Use `tests` (chai `expect`) when a check needs logic. Quote interpolated string values (`res.body.id: eq "{{customerId}}"`), because Bruno turns number-like values into numbers.
- **Docs** (the request's `docs`): what it does, the auth it needs, each error status and when it happens, side effects, and the variables it sets for later requests.

`.bru`:
```
meta {
  name: Update customer
  type: http
  seq: 3
}

patch {
  url: {{baseUrl}}/customers/{{customerId}}
  body: json
  auth: inherit
}

body:json {
  {
    "email": "new@example.com"
  }
}

assert {
  res.status: eq 200
  res.body.email: eq new@example.com
}

docs {
  Changes a customer's email. Returns 404 when the customer doesn't exist, and 422 when the email is invalid.
}
```

YAML (OpenCollection):
```yaml
info:
  name: Update customer
  type: http
  seq: 3
http:
  method: PATCH
  url: "{{baseUrl}}/customers/{{customerId}}"
  auth: inherit
  body:
    type: json
    data: '{"email": "new@example.com"}'
runtime:
  assertions:
    - expression: res.status
      operator: eq
      value: "200"
    - expression: res.body.email
      operator: eq
      value: new@example.com
docs: |
  Changes a customer's email. Returns 404 when the customer doesn't exist, and 422 when the email is invalid.
```

Passing an id forward in YAML (the create request; `expression` takes the same `res.body…` path as `.bru` post-response vars):
```yaml
runtime:
  actions:
    - type: set-variable
      phase: after-response
      selector:
        expression: res.body.id
        method: jsonq
      variable:
        name: customerId
        scope: runtime
```

## 5. Environments and secrets
- One environment per target in `environments/` (`local`, `ci`, and `staging` if the team tests there). Each defines `baseUrl` and every variable the requests use that no request sets.
- Secrets come from the collection-root `.env` as `{{process.env.API_TOKEN}}`. Keep `.env` git-ignored, and commit a placeholder sample (`.env.sample`, or the repo's existing `.env.example`). Bruno's generated `.gitignore` ignores `.env*`, which also hides the sample, so add a `!` line for the sample's name (`!.env.sample` or `!.env.example`).
- Bruno's secret variables (`vars:secret [ token ]` in `.bru`, `secret: true` in YAML) keep values out of the file but on one machine only, so CI can't read them. Use `process.env` for anything CI needs.
- Never put a real token in an environment file, a committed script, or a `--env-var` argument in CI config. Pass it from the CI secret store as an environment variable.

## 6. Running the collection
- Start the service and its dependencies first. With `laa-docker`, that's the repo's compose command (`docker compose up -d --wait`), and the `local` environment's `baseUrl` points at the published port.
- Run from the collection root: `cd api/bruno && bru run --env local`. For one folder: `bru run customers --env local`. Use `-r` to recurse and `--bail` to stop at the first failure. It exits 1 when any request, assertion, or test fails.
- Scripts run in Safe Mode by default. Keep them free of `require` and file access so they run there. If they need Developer Mode, say so in the collection docs and run with `--sandbox developer`.
- Report the command, the environment, and the pass/fail counts. Never claim the collection passed without running it.

## 7. CI
Run the collection on every PR against a freshly started service, and keep the report:
```yaml
- uses: usebruno/bruno-cli-action@v1
  with:
    working-directory: api/bruno
    command: run --env ci --reporter-html results.html --reporter-skip-headers "Authorization"   # no "bru" prefix; the action adds --reporter-junit
    bru-version: "4.2.1"                                 # pin it; the default is latest
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
- uses: actions/upload-artifact@v7                     # v5 and older run on Node 20, which GitHub is retiring on runners
  if: ${{ !cancelled() }}
  with:
    name: api-tests
    path: api/bruno/results.html
    retention-days: 7
```
The report records request and response headers and bodies, so it can hold the secrets CI injected. Treat `results.html` as sensitive: `--reporter-skip-headers "Authorization"` keeps the token out (list any other secret header), and for login flows add `--reporter-skip-request-body` (it applies to every request in the run).
On other CI systems: `npm i -g @usebruno/cli@<pinned version>`, then `bru run --env ci --reporter-junit results.xml` from the collection root. Pin the CLI version the same way as every other tool.

## 8. Docs people read
- The spec is the API reference. Render it with what the repo already uses (Redoc, Swagger UI, Scalar). Don't add a docs site without asking.
- `bru docs generate -o api-docs.html` builds a standalone HTML page from the collection's docs and examples. Treat it as a CI artifact, not a committed file.
- The README links to the spec and the collection and says how to run them. `laa-docs` covers the README itself.

## Definition of done (API docs and tests)
- [ ] Every changed endpoint is in the spec with all its status codes, schemas, and response headers, or the generated spec was regenerated. Generated code was regenerated from the spec, not hand-edited.
- [ ] The spec passes the repo's linter, and breaking changes were checked (`oasdiff breaking`, or by hand) and reported.
- [ ] Every changed endpoint has a request in the collection, in the collection's format, with assertions and docs.
- [ ] Requests use `{{baseUrl}}`, inherited auth, and chained ids. No literal hosts, tokens, or ids.
- [ ] Every variable a request uses is defined in each environment or set by an earlier request.
- [ ] `.env` is ignored, the sample is committed, and CI gets secrets from its secret store.
- [ ] The collection was run against the service, and the command and result were reported (or it was stated that it wasn't run).

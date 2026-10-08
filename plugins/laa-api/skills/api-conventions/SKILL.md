---
name: api-conventions
description: API documentation and testing for HTTP APIs, in any language. OpenAPI is the contract and reference, and a Bruno collection holds runnable examples and tests that CI runs. Use whenever adding, changing, or removing an endpoint, route, handler, or controller action; changing request or response fields, status codes, or auth; writing or updating API docs or API tests; setting up Bruno or an OpenAPI spec; or running API tests in CI. Also use for "document the API", "test this endpoint", "add it to the collection", "set up Bruno", "update the OpenAPI spec", "smoke-test the API". The repo's existing spec, collection, API tooling, and CLAUDE.md override these defaults.
---

# API docs and tests

**Precedence: the repo's existing spec and its generator, its API collection (Bruno, Postman, `.http` files, Hurl), its CI, `CLAUDE.md`, and `.claude/laa/project-map.md` override everything here.** If the repo uses another API tool, follow it and don't add Bruno next to it without asking.

The goal: each endpoint has a contract people can read (the OpenAPI spec) and a request anyone can run (the Bruno collection). Both change in the same commit as the code. API design (resource shape, errors, pagination, versioning) belongs to `laa:api-designer`. This skill keeps the docs and tests true to what the code does.

## 1. Detect, once per task
- **Spec**: `openapi.{yaml,yml,json}`, `swagger.*`, or `api/*.yaml`. Also check whether the spec is **generated from code** (swaggo, Swashbuckle or NSwag, FastAPI, NestJS `@nestjs/swagger`, springdoc, a `generate`/`openapi` script). A generated spec is never hand-edited: change the annotations and regenerate it with the repo's command.
- **Collection**: a folder with `opencollection.yml` (YAML format) or `bruno.json` (`.bru` format). Its root is where `bru` commands run.
- **Neither exists**: propose `api/openapi.yaml` + `api/bruno/` and ask first, since this sets a team-wide rule. To start a collection from an existing spec: `bru import openapi --source api/openapi.yaml --output api/bruno --collection-name "<Service> API"`. Check where the files landed, then tidy the result into the layout below.
- No HTTP API in the change (a CLI, a library, a worker with no endpoints): this skill doesn't apply.

## 2. The contract (OpenAPI)
Every endpoint change updates the spec in the same change:
- the path and method, the path, query, and header parameters, and the request body schema;
- **every status code the handler can return**, each with a response schema (error responses included);
- the security requirement, and enum values the code adds (a new `status` value is a contract change);
- `summary` and `description` written for a client developer.

A removed or renamed field, a new required field, or a changed status code breaks clients. Say so, and bring in `laa:api-designer` for the versioning decision.

## 3. The collection (Bruno)
- **Format**: match the collection's existing format. For a new collection use YAML (OpenCollection), Bruno's default since v4. Use `.bru` only when the team asks. Don't mix both in one collection outside a migration.
- **Layout**: one folder per resource, one request per endpoint, with file names in kebab-case after the operation (`customers/create-customer.yml`, `customers/update-customer.bru`). Add separate requests for error cases worth guarding (`update-customer-invalid-email-422`).
- **Order and chaining**: `seq` orders a flow, so create runs before get, update, and delete. Pass ids forward with a post-response variable (`.bru`: `vars:post-response { customerId: res.body.id }`; YAML: a `set-variable` action under `runtime.actions`). Never hardcode an id that only exists in one database.

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

YAML (OpenCollection). Copy the auth setup from a sibling request so it inherits the same way:
```yaml
info:
  name: Update customer
  type: http
  seq: 3
http:
  method: PATCH
  url: "{{baseUrl}}/customers/{{customerId}}"
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
    command: run --env ci --reporter-html results.html   # no "bru" prefix; the action adds --reporter-junit
    bru-version: "4.2.1"                                 # pin it; the default is latest
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
- uses: actions/upload-artifact@v4
  if: ${{ !cancelled() }}
  with:
    name: api-tests
    path: api/bruno/results.html
```
On other CI systems: `npm i -g @usebruno/cli@<pinned version>`, then `bru run --env ci --reporter-junit results.xml` from the collection root. Pin the CLI version the same way as every other tool.

## 8. Docs people read
- The spec is the API reference. Render it with what the repo already uses (Redoc, Swagger UI, Scalar). Don't add a docs site without asking.
- `bru docs generate -o api-docs.html` builds a standalone HTML page from the collection's docs and examples. Treat it as a CI artifact, not a committed file.
- The README links to the spec and the collection and says how to run them. `laa-docs` covers the README itself.

## Definition of done (API docs and tests)
- [ ] Every changed endpoint is in the spec with all its status codes and schemas, or the generated spec was regenerated.
- [ ] Every changed endpoint has a request in the collection, in the collection's format, with assertions and docs.
- [ ] Requests use `{{baseUrl}}`, inherited auth, and chained ids. No literal hosts, tokens, or ids.
- [ ] Every variable a request uses is defined in each environment or set by an earlier request.
- [ ] `.env` is ignored, the sample is committed, and CI gets secrets from its secret store.
- [ ] The collection was run against the service, and the command and result were reported (or it was stated that it wasn't run).

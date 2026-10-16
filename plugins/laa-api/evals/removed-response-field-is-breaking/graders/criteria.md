---
type: llm
weight: 1
---

The workspace is an Express customers service. `api/openapi.yaml` lists `legacyCode` as a required property
of the `Customer` response schema, the README says partner integrations generate clients from the spec, and
`api/bruno/customers/get-customer.bru` asserts `res.body.legacyCode: isString`. `.github/workflows/api.yml`
runs the Bruno collection but has no breaking-change check. The user removed `legacyCode` from the handler as
"cleanup" and asked for the matching spec and Bruno diffs, without running anything.

The response passes only if ALL of these hold:
- It clearly says that removing `legacyCode` from the response is a breaking change for clients (it was a
  required response field), rather than treating it as a doc-only cleanup.
- It names `oasdiff` as the check: either the CLI (`oasdiff breaking ...`, for example comparing
  `origin/main:api/openapi.yaml` with `api/openapi.yaml`, optionally `--fail-on ERR`) or the
  `oasdiff/oasdiff-action/breaking` CI step with `fail-on: ERR`.
- It recommends a safer path or a decision before shipping the removal: deprecate the field first
  (`deprecated: true`), a new API version, or bringing in the API design / versioning decision.
- If it gives the spec and Bruno diffs, they remove `legacyCode` from both `required` and `properties` and
  drop the `legacyCode` assertion and docs mention from the request.
- It does not claim it ran commands or edited files.

Bumping `actions/upload-artifact` from `@v4` to the current major, adding a spec lint step, or bumping
`info.version` are pluses but not required.

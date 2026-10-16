---
type: llm
weight: 1
---

The workspace is an Express orders service with a Bruno collection in `api/bruno/` whose collection-level auth is
a bearer token from `{{process.env.API_TOKEN}}`. The branch adds `.github/workflows/api-tests.yml`, which starts
the service, runs the collection with `usebruno/bruno-cli-action` (pinned `bru-version`) and
`--reporter-html results.html`, passes `API_TOKEN` from `secrets.API_TOKEN`, and uploads `results.html` with
`actions/upload-artifact`. The user asked the api-reviewer agent to review the branch and relay its findings.

The response passes only if ALL of these hold:
- It reports that the uploaded HTML report (`results.html`) records request headers, so the `Authorization`
  bearer token from the CI secret ends up in the artifact anyone with read access can download.
- The fix it gives keeps the token out of the report: `--reporter-skip-headers "Authorization"` (or
  `--reporter-skip-all-headers`) on the `bru run` command. Only shortening the retention, or only making the
  artifact private, does not pass.
- It does not claim the token is committed or hardcoded in the repo.

Flagging `actions/upload-artifact@v4` as an outdated major, or suggesting `--reporter-skip-request-body`, are
pluses but not required.

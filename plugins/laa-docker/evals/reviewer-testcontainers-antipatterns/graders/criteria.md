---
type: llm
weight: 1
---

The branch adds internal/store/store_integration_test.go. It starts `postgres:16.4` (the same pin as
compose.yaml) through `testcontainers.GenericContainer` with `ExposedPorts: "5432:5432/tcp"`, sleeps
`5 * time.Second`, then connects to `localhost:5432`.

The response passes only if ALL of these hold:
- It flags the fixed host port binding (`5432:5432`), with a scenario such as a clash with a local
  Postgres, another test package, or a parallel run.
- It flags the hard-coded `localhost:5432` and says to build the address from the container's host and
  mapped port (for example `Host`/`MappedPort`) or the module's connection string.
- It flags the `time.Sleep` and says to use a wait strategy (for example a log message or listening port)
  or the module's built-in readiness wait.
- It suggests the Testcontainers Postgres module instead of the raw generic container.
- It does not report the image pin or a version drift as a finding: `postgres:16.4` matches compose.

Noting the hard-coded credentials as fine because they are dev-only placeholders is a plus but not
required.

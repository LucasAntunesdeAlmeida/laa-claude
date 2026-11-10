---
type: llm
weight: 1
---

The branch bumps the compose `db` service from `postgres:17.6` to `postgres:18.1` and keeps the named
volume `db-data` mounted at `/var/lib/postgresql/data`. Teammates already have a `db-data` volume holding a
Postgres 17 cluster. On 18+ the official image keeps `PGDATA` at `/var/lib/postgresql/18/docker` and its
entrypoint exits with an error when `/var/lib/postgresql/data` is mounted; it also exits when it finds an
old cluster's `PG_VERSION` directly under `/var/lib/postgresql`.

The response passes only if ALL of these hold:
- It flags the `db-data:/var/lib/postgresql/data` mount in compose.yaml as wrong for Postgres 18.
- It says the container fails to start (the entrypoint errors or exits) with that mount. Saying only
  that data is silently lost, or not saying what happens, fails this.
- Its fix mounts the volume at `/var/lib/postgresql`.
- It handles the existing 17 data: a new named volume (for example `db-data-18`) while keeping the old
  one, or a migration with `pg_upgrade` or dump/restore. Simply moving the existing `db-data` volume to
  `/var/lib/postgresql` with no migration or new volume fails this.
- It does not recommend `docker compose down -v`, `docker volume rm`, or otherwise deleting the old
  volume without asking first.

Mentioning that the image pins and CI versions match, or the `PGDATA` path, are pluses but not required.

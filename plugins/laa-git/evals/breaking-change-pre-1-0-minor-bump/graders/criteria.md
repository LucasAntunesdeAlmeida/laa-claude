---
type: llm
weight: 1
---

The workspace is a Python library at version 0.4.2 (pyproject.toml and src/geokit/__init__.py) that
releases by hand per RELEASING.md, with no release tooling. Since 0.4.2 it has one breaking commit
(`feat(geocode)!: ...`), one `feat`, and one `fix`. The user asked for the next version, the edits,
and the tag command, without anything being run.

The response passes only if ALL of these hold:
- The next version is `0.5.0`. Answering `1.0.0` (a MAJOR bump for the breaking change) fails, and so
  does `0.4.3`.
- It explains, at least briefly, that under 0.y.z a breaking change bumps MINOR rather than MAJOR.
- It sets the version to `0.5.0` without a `v` in pyproject.toml and `__init__.py`, and the tag is
  `v0.5.0` (the `v` only on the tag). Writing `version = "v0.5.0"` fails.
- The CHANGELOG entry lists the breaking change first, with how to migrate.
- It does not claim it ran commands, created the tag, or edited files. Saying it looked for existing
  tags or files in the checkout is fine: reading the workspace is allowed.

Mentioning that 1.0.0 is a deliberate stability decision the user can make separately, or using an
annotated tag (`git tag -a`), are pluses but not required.

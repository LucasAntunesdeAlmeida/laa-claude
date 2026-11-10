---
type: llm
weight: 1
---

The workspace is a Node library at 0.4.2 that releases through release-please. Its
release-please-config.json does NOT set `bump-minor-pre-major`, which defaults to false, so
release-please bumps a breaking change at 0.x to 1.0.0. Since 0.4.2, main has a `feat(client)!:`
commit and a `fix`. The user asked what version the next release PR will be. Nothing should be
run.

The response passes only if ALL of these hold:
- It says that, with the current config, release-please will propose 1.0.0 (because
  `bump-minor-pre-major` is not set). Predicting 0.5.0 from the current config fails.
- It tells the user that to stay on 0.x they can set `"bump-minor-pre-major": true` in
  release-please-config.json (the release PR then becomes 0.5.0), and/or use a `Release-As: 0.5.0`
  commit footer.
- It does not tell the user to hand-tag or hand-edit the version or CHANGELOG.md to release.
- It does not claim it ran commands or edited files. Saying it read the config is fine.

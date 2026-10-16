---
type: llm
weight: 1
---

The workspace releases through release-please: release-please-config.json, .release-please-manifest.json
(at 1.3.0), a release-please GitHub Actions workflow on pushes to main, and a generated CHANGELOG.md.
The user asked for hand edits and commands to bump to 1.4.0, edit the changelog, and tag and push v1.4.0,
without anything being run.

The response passes only if ALL of these hold:
- It notices release-please and says it owns the version bump, CHANGELOG.md, the tag, and the GitHub
  release here.
- It does NOT give, as the way to release, a hand `git tag v1.4.0` / `git push origin v1.4.0`, a hand
  edit of `version` in package.json or the manifest, or a hand-written CHANGELOG.md entry. Mentioning
  them only to say not to do them is fine.
- It tells the user how to ship through the tool: merge the release PR that release-please opens (or
  will open) for 1.4.0, which creates the tag and release. If it addresses forcing the version, it
  uses a `Release-As: 1.4.0` commit footer (or the `release-as` config), not a hand tag.
- It does not claim it ran commands or edited files.

Noting that a `feat:` commit since 1.3.0 already makes release-please propose 1.4.0, or checking that
the feature commit was a Conventional `feat`, are pluses but not required.

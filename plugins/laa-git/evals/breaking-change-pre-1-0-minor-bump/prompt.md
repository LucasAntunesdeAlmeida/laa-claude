---
name: breaking-change-pre-1-0-minor-bump
description: A 0.x library with no release tooling has a breaking commit since its last release. With laa-git, the answer bumps MINOR (0.4.2 to 0.5.0) under SemVer's 0.y.z rules, puts `v` only on the tag, and doesn't jump to 1.0.0.
tags: [git, release, semver]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

time to cut a release of geokit. since the last release we merged these commits:

- feat(geocode)!: return Result objects instead of raising on lookup misses
- feat(cli): add --format json
- fix(distance): handle antimeridian crossing

what's the next version number? give me the exact edits and the tag command, don't run anything

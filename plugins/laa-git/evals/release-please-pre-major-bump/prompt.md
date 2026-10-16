---
name: release-please-pre-major-bump
description: Regression guard rather than a before/after discriminator. The model already knows release-please's 0.x default once it reads the config; without the pack only the skill-fired grader fails. A 0.4.2 library releases through release-please, and its config doesn't set `bump-minor-pre-major`. After a `feat(client)!:` commit, the answer with laa-git checks that option and predicts the release PR at 1.0.0 (release-please's default), and says setting `bump-minor-pre-major` to true would give 0.5.0, rather than assuming the 0.x convention gives 0.5.0.
tags: [git, release, semver]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

we merged these to main since 0.4.2:

- feat(client)!: take the limit as a duration string instead of milliseconds
- fix(client): stop double-counting retries

what version will the next release PR be? don't run anything

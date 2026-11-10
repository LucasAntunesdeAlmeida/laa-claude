---
name: review-routes-godot-to-godot-reviewer
description: Regression guard rather than a before/after discriminator (an installed pack's reviewer is visible to the review skill without its routing line). /laa:review adds the laa-godot reviewer for Godot scene and project files, not just .gd scripts. A diff that only touches project.godot and a .tscn still gets laa-godot:godot-reviewer on the panel.
tags: [review, routing, godot]
plugins: ["../../plugins/laa", "../../plugins/laa-godot"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

/laa:review feat/boss-arena

there's no shell here, so take my word for the diff: the branch only changes project.godot (a new input action) and levels/boss_arena/boss_arena.tscn (new nodes and a collision layer change). do steps 1 and 2 only: list the reviewers you'd put on the panel, then stop before running it

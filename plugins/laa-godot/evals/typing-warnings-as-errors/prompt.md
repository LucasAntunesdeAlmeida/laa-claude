---
name: typing-warnings-as-errors
description: A Godot 4.7 project sets warnings/untyped_declaration=2 under a [gdscript] section, which makes it the nonexistent key gdscript/warnings/untyped_declaration, so untyped GDScript still runs. With laa-godot, the fix moves it under [debug] as gdscript/warnings/untyped_declaration=2 and adds the unsafe_* warnings for the property access on untyped values, instead of retyping the script or toggling an editor option.
tags: [godot, gdscript, typing, warnings]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

our godot project is supposed to reject untyped gdscript. we set the untyped declaration warning to error in project.godot a while back, but inventory/inventory.gd is untyped and the game still runs without a single warning, and nothing complains about it reading fields off untyped values either. what's wrong, and what exactly do I change? don't run anything or edit files, just tell me

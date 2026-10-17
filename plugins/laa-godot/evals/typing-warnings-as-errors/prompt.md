---
name: typing-warnings-as-errors
description: A Godot 4.7 project sets gdscript/warnings/treat_warnings_as_errors, a Godot 3 key, expecting it to reject untyped GDScript. With laa-godot, the fix says that key doesn't exist in Godot 4 and raises the individual typing warnings (untyped_declaration, unsafe_*) to 2 instead of tweaking the dead key.
tags: [godot, gdscript, typing, warnings]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

our godot project is supposed to reject untyped gdscript. we set warnings as errors in project.godot a while back, but inventory/inventory.gd is untyped and the game still runs without a single warning. what's wrong, and what exactly do I change? don't run anything or edit files, just tell me

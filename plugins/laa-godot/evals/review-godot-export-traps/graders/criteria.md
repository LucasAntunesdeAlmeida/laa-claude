---
type: llm
weight: 1
---

The workspace is a Godot 4.7 project. `enemies/slime/slime.gd` preloads `res://Effects/Splat/splat.tscn`, but the
folder on disk is `effects/splat/`. `.gitignore` contains `*.uid`. The slime calls `get_parent().get_parent().add_score(10)`
on death and finds the player with `get_node("/root/Level/Player")`. `save/save_game.gd` writes to `res://save/slot_1.json`.
The slime also multiplies `velocity` by `delta` before `move_and_slide()`, and most of its code is untyped. The user says it
works in the editor on Windows.

The response passes only if ALL of these hold:
- It flags the `res://Effects/Splat/splat.tscn` path: the case doesn't match `effects/splat/`, Windows hides the mismatch,
  and the exported game (case-sensitive PCK) or a case-sensitive OS fails to load it. The fix is the lowercase path.
- It flags `*.uid` in `.gitignore`: since Godot 4.4, `.uid` files must be committed, or UID references break on other
  clones or machines. The fix is to remove that line and commit the `.uid` files.
- It flags at least one of: the child reaching up the tree (`get_parent().get_parent().add_score`, fix: emit a signal
  that the level connects), the save written to `res://` (read-only in exported games, fix: `user://`), or
  `velocity` multiplied by `delta` before `move_and_slide()` (it applies `delta` itself, so the slime barely moves).
- It does not claim it edited files or ran Godot.

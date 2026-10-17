---
name: review-godot-export-traps
description: The laa-godot reviewer flags Godot bugs that pass in a Windows editor but break elsewhere, a res:// path whose case doesn't match the folder (the exported PCK is case-sensitive) and *.uid in .gitignore (required in git since 4.4), plus a child calling into its grandparent, a save written to res://, or velocity scaled by delta before move_and_slide, instead of approving code that runs fine locally.
tags: [godot, review, export]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Agent]
---

ask the laa-godot:godot-reviewer agent to review this change and relay its findings, don't review it yourself. the change is new: enemies/slime/slime.gd, effects/splat/, save/save_game.gd, and the .gitignore. it works fine when I play it in the editor on my windows machine. don't run anything or edit files

#!/bin/sh
# Seeds a Godot 4.7 project whose project.godot raises untyped_declaration to error, but under a
# [gdscript] section as warnings/untyped_declaration=2. A section name is the first segment of the key,
# so that's the setting gdscript/warnings/untyped_declaration, which doesn't exist: the real one is
# debug/gdscript/warnings/untyped_declaration ([debug] + gdscript/warnings/...). Godot ignores the
# unknown key, the typing warnings stay off (their default), and the untyped code in
# inventory/inventory.gd raises nothing. No unsafe_* warning is set either.
set -eu

mkdir -p inventory

cat > project.godot <<'INI'
; Engine configuration file.

config_version=5

[application]

config/name="Lantern Keep"
config/features=PackedStringArray("4.7", "Forward Plus")
run/main_scene="res://main.tscn"

[gdscript]

warnings/untyped_declaration=2

[rendering]

textures/canvas_textures/default_texture_filter=0
INI

cat > inventory/inventory.gd <<'GD'
class_name Inventory
extends RefCounted

signal changed

var slots = []
var capacity = 24


func add(item, count = 1):
	for slot in slots:
		if slot.item.id == item.id and slot.count < item.max_stack:
			slot.count += count
			changed.emit()
			return true
	if slots.size() >= capacity:
		return false
	slots.append({"item": item, "count": count})
	changed.emit()
	return true
GD

cat > main.gd <<'GD'
extends Node
GD

cat > main.tscn <<'TSCN'
[gd_scene format=3]

[ext_resource type="Script" path="res://main.gd" id="1"]

[node name="Main" type="Node"]
script = ExtResource("1")
TSCN

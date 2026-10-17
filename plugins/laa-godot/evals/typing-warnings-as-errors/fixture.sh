#!/bin/sh
# Seeds a Godot 4.7 project whose project.godot sets gdscript/warnings/treat_warnings_as_errors=true under
# [debug], a Godot 3 key that Godot 4 doesn't have, and nothing else. The typing warnings
# (untyped_declaration, unsafe_*) are off by default in Godot 4, so the untyped code in
# inventory/inventory.gd raises nothing.
set -eu

mkdir -p inventory

cat > project.godot <<'INI'
; Engine configuration file.

config_version=5

[application]

config/name="Lantern Keep"
config/features=PackedStringArray("4.7", "Forward Plus")
run/main_scene="res://main.tscn"

[debug]

gdscript/warnings/treat_warnings_as_errors=true
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

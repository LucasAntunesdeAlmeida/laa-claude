#!/bin/sh
# Seeds a Godot 4.7 project with bugs that pass in a Windows editor and break elsewhere:
# - enemies/slime/slime.gd preloads "res://Effects/Splat/splat.tscn" but the folder is effects/splat/.
#   Windows resolves it; the exported PCK (case-sensitive) doesn't, so the exported game fails to load the slime.
# - .gitignore ignores *.uid, so UID references break on other clones (required in git since 4.4).
# - the slime calls get_parent().get_parent().add_score(), so it only works under level/enemies/.
# Plus untyped code, velocity * delta before move_and_slide(), and a save written to res:// (read-only in exports).
set -eu

mkdir -p enemies/slime effects/splat level save

cat > project.godot <<'INI'
; Engine configuration file.

config_version=5

[application]

config/name="Moss Hollow"
config/features=PackedStringArray("4.7", "Forward Plus")
run/main_scene="res://level/level.tscn"
INI

cat > .gitignore <<'TXT'
# Godot 4+ specific ignores
.godot/
/android/
*.uid
TXT

cat > enemies/slime/slime.gd <<'GD'
extends CharacterBody2D

const SPLAT = preload("res://Effects/Splat/splat.tscn")

@export var max_health := 3
@export var speed := 40.0

var health
var target


func _ready():
	health = max_health
	target = get_node("/root/Level/Player")


func _physics_process(delta):
	if target:
		velocity = global_position.direction_to(target.global_position) * speed * delta
		move_and_slide()


func hit(damage):
	health -= damage
	if health <= 0:
		var splat = SPLAT.instantiate()
		splat.global_position = global_position
		get_parent().add_child(splat)
		get_parent().get_parent().add_score(10)
		queue_free()
GD

cat > effects/splat/splat.gd <<'GD'
extends Node2D


func _ready() -> void:
	await get_tree().create_timer(0.5).timeout
	queue_free()
GD

cat > effects/splat/splat.tscn <<'TSCN'
[gd_scene format=3]

[ext_resource type="Script" path="res://effects/splat/splat.gd" id="1"]

[node name="Splat" type="Node2D"]
script = ExtResource("1")
TSCN

cat > level/level.gd <<'GD'
extends Node2D

var score := 0


func add_score(points: int) -> void:
	score += points
GD

cat > save/save_game.gd <<'GD'
class_name SaveGame
extends RefCounted

const SAVE_PATH := "res://save/slot_1.json"


static func write(data: Dictionary) -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(data))
GD

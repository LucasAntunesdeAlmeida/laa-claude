---
name: godot-conventions
description: Godot 4 game development conventions for GDScript (static typing and the warnings that enforce it in project.godot, the official style guide and script order, scene architecture with "call down, signal up", dependency injection and configuration warnings, autoloads versus static functions, Resources, and an event bus, data structures, project layout and lowercase paths, git with .uid and .import files, Git LFS, performance and object pooling, physics and input, saving to user://, GUT and gdUnit4 tests, GDScript formatters and linters, headless import, test, and export in CI) plus short Godot C# notes. Use when writing, scaffolding, or reviewing Godot code or scenes (.gd, .tscn, .tres, project.godot, export_presets.cfg, or .cs files in a Godot project), when setting up a Godot repo, tests, lint, or CI exports, or when upgrading Godot 4.x, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Godot 4 conventions (GDScript)

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Engine version
- Read `config/features` in `project.godot` (for example `PackedStringArray("4.7")`) before writing code, and only use features that version has. Target the current stable 4.x for new projects (4.7 as of this writing). Use the standard editor build unless the project uses C#.
- Features you may need to check against that line:
  - **4.3**: physics interpolation in 2D.
  - **4.4**: typed dictionaries (`Dictionary[StringName, int]`), `@export_tool_button`, `.uid` files beside scripts and shaders, physics interpolation in 3D, Jolt built in (opt-in).
  - **4.5**: `@abstract` classes and methods, variadic functions (`func log_all(...args: Array)`).
  - **4.6**: Jolt is the default 3D physics engine for *new* projects. Existing projects keep their `physics/3d/physics_engine` setting.
  - **4.7**: `Tween.tween_await(signal)`, the Asset Store (replaces the Asset Library), per-platform export template downloads.
- Upgrade one minor version at a time, read that version's migration guide, open the project in the editor once so it re-imports and rewrites files, and commit that rewrite on its own.

## Static typing
- Type everything: variables, constants, parameters, return types (`-> void` included), and collections (`Array[Enemy]`, `Dictionary[String, int]`).
- Use `:=` when the type is obvious from the right-hand side (`var spawn_offset := Vector2(0.0, -16.0)`). Write the type out when it isn't (`var max_health: int = 100`), and always for `@onready` node references, whose type can't be inferred:
  ```gdscript
  @onready var health_bar: ProgressBar = %HealthBar
  ```
- `as` returns `null` silently when the cast fails, so it hides a wrong node type. Prefer a typed declaration, or check the result.
- Give every script that other scripts use as a type a `class_name`. Use typed signal parameters: `signal health_changed(new_value: int)`.
- **Enforce it in `project.godot`.** The typing warnings are off by default. Each `debug/gdscript/warnings/<name>` key takes 0 (ignore), 1 (warn), or 2 (error), and 2 stops the script from running until it's fixed:
  ```ini
  [debug]
  gdscript/warnings/untyped_declaration=2
  gdscript/warnings/unsafe_property_access=2
  gdscript/warnings/unsafe_method_access=2
  gdscript/warnings/unsafe_cast=1
  gdscript/warnings/unsafe_call_argument=2
  gdscript/warnings/return_value_discarded=1
  ```
  - GDScript has no global "treat warnings as errors" switch in Godot 4 (`debug/shader_language/warnings/treat_warnings_as_errors` is for shaders only, and the Godot 3 GDScript key is gone). Raise each warning to 2.
  - `debug/gdscript/warnings/directory_rules` silences `res://addons` by default, so third-party code doesn't break the build.
  - Suppress a single line with `@warning_ignore("unsafe_method_access")` and a comment saying why. A block takes `@warning_ignore_start(...)` / `@warning_ignore_restore(...)`.
- Turn on *Editor Settings → Text Editor → Completion → Add Type Hints*. Typed code also runs faster: the VM uses typed opcodes when it knows the operand types.

## Style (official GDScript style guide)
- Naming: files and folders `snake_case`, classes and nodes `PascalCase`, functions and variables `snake_case`, constants and enum members `CONSTANT_CASE`, enum names `PascalCase` and singular. Signals are past tense (`door_opened`, `health_depleted`). Prefix private members and overridable virtuals with `_`.
- Script order: `@tool`, `@icon`, `@abstract`, `class_name`, `extends`, `##` doc comment; then signals, enums, constants, static vars, `@export` vars, other vars, `@onready` vars; then `_static_init` and static methods; then `_init`, `_enter_tree`, `_ready`, `_process`, `_physics_process`, other virtuals; then public methods, private methods, inner classes.
- Formatting: tabs, LF line endings, UTF-8 without BOM, lines under 100 characters. `and`/`or`/`not` over `&&`/`||`/`!`. Double quotes. Two blank lines between functions. Trailing commas in multi-line arrays, dictionaries, and enums.
- Connect signals with callables (`door.opened.connect(_on_door_opened)`) and emit with `door_opened.emit()`, not the string-based Godot 3 forms.

## Scene architecture
- **Call down, signal up.** A parent starts behavior by calling methods on its children or setting their properties. A child reports what happened through signals and never reaches up (`get_parent()`, `../..` paths, `owner.some_method()`). Siblings talk through their common ancestor.
- **Inject dependencies.** When a scene needs something from outside, the parent passes it in: a node reference, a `Callable`, or an exported `NodePath`. Make the scene a `@tool` script that returns messages from `_get_configuration_warnings()` when a dependency is missing, and call `update_configuration_warnings()` when it changes, so the editor flags it. A `@tool` script runs `_ready`, `_process`, and setters in the editor too, so start gameplay callbacks with `if Engine.is_editor_hint(): return`.
- Every scene should run on its own (F6) with stub dependencies. If it can't, it's coupled to its surroundings.
- Top-level tree: a `Main` node (`main.gd`) with a `World` (swap its children to change levels) and a `GUI` (`Control`). A node is a child only when it belongs to its parent and should be freed with it.
- **Autoloads** only for systems that own their data, need to be reached from everywhere, and stand alone: save system, settings, audio buses, scene transitions. They are global state, so every caller depends on them. Prefer, in order:
  - `static func` on a `class_name` script for stateless helpers, `static var` for shared state of one type.
  - A custom `Resource` (`class_name ItemData extends Resource`) for shared or designer-edited data.
  - A node owned by the scene that needs it.
  - An event-bus autoload of typed signals, only for genuinely many-to-many events (achievements, analytics). Never for a parent talking to its own children.
- Reference nodes in your own scene by unique name (`%HealthBar`, marked "Access as Unique Name") and cache them in `@onready` vars. Don't reach into another scene's internals by path. A plain `var x = $Node` outside `@onready` is an error by default (`get_node_default_without_onready`).
- `queue_free()`, not `free()`, for nodes that may still be processing. Inside physics callbacks, change collision state with `set_deferred("disabled", true)`. After an `await`, check `is_instance_valid(node)` before touching a node that may have been freed.

## Data
- `Array` for ordered data you iterate over, `Dictionary` for lookup by key. Typed versions of both. `PackedFloat32Array`, `PackedVector2Array`, and similar for large numeric data.
- A plain `RefCounted` or `Object` (not a `Node`) for data and logic that needs no scene tree: inventories, state machines, pathfinding graphs.
- Custom `Resource`s for authored data (items, enemy stats, levels), edited in the inspector and saved as `.tres`. A `.tres` is shared by everything that loads it, so call `duplicate()` (or set *Local to Scene*) before mutating per-instance state.
- Animation: `AnimatedSprite2D` for frame animation, `AnimationPlayer` to animate properties or call methods, `AnimationTree` for blending and state machines.
- **Save games** go to `user://`. `res://` is read-only in exported games. Write with `FileAccess` (JSON) or `ConfigFile`, and include a format version for migrations. Never `load()` a `.tres` or `.res` from a source players can edit or download: resources can embed scripts that run on load.

## Project layout
- Group by feature: `player/`, `enemies/<name>/`, `ui/main_menu/`, `levels/`, with each scene's script and assets beside it, plus `common/` for shared code and `addons/` for third-party plugins.
- **Lowercase snake_case file and folder names.** The exported PCK is case-sensitive while Windows and macOS usually aren't, so `load("res://Player/Player.tscn")` for `player/player.tscn` works in the editor and fails in the exported game.
- `preload()` constant paths. For large scenes, use `ResourceLoader.load_threaded_request()` behind a loading screen.
- Put raw sources (`.blend`, `.psd`, `.kra`) in a folder with an empty `.gdignore`, or outside the project, so Godot doesn't import them.
- Use Input Map actions (`Input.is_action_pressed("jump")`), not raw keycodes. Handle gameplay input in `_unhandled_input()`, so the UI consumes its events first.

## Version control
- Generate `.gitignore` and `.gitattributes` with *Project → Version Control → Generate Version Control Metadata* (or check "Git" when creating the project). They ignore `.godot/` and force LF line endings. On Windows, also set `git config core.autocrlf input`.
- Commit `project.godot`, `export_presets.cfg`, `*.import`, and (since 4.4) every `*.uid`. Never ignore `*.uid`. When moving or deleting a script or shader outside the editor, move or delete its `.uid` with it.
- Don't commit `.godot/` (cache, including `.godot/export_credentials.cfg` with signing passwords) or generated `*.translation` files.
- Track binaries with Git LFS before their first commit: models (`*.glb`, `*.blend`), textures, audio, fonts, and binary resources (`*.res`, `*.scn`). Text scenes and resources (`.tscn`, `.tres`) stay in git so they diff and merge.

## Performance
- Profile before optimizing: the Debugger's Profiler and Monitors, or the `Performance` singleton. A node count that keeps rising (`OBJECT_NODE_COUNT`) means nodes are leaking.
- Movement and physics in `_physics_process(delta)` (fixed tick, 60 Hz by default), visuals in `_process(delta)`. Scale manual movement by `delta`. `CharacterBody2D.move_and_slide()` applies `delta` itself, so set `velocity` in units per second and don't multiply it by `delta`.
- Turn on physics interpolation (`physics/common/physics_interpolation`, 2D since 4.3, 3D since 4.4) for smooth motion on high-refresh displays, and call `reset_physics_interpolation()` after teleporting a node.
- Use signals, not polling: an `Area2D`/`Area3D` instead of distance checks every frame, a `Timer` instead of counting frames. Turn off processing for off-screen entities (`VisibleOnScreenEnabler2D`, `set_process(false)`).
- Pool objects that spawn many times per second (projectiles, hit effects): create them up front, hide and disable them (`process_mode = PROCESS_MODE_DISABLED`) instead of freeing, and reset their state in a `reset()` method. `_ready()` doesn't run again when a pooled node is reused.
- Avoid `get_node()`, `find_child()`, `get_tree().get_nodes_in_group()`, and string building inside per-frame code. Cache what you need.

## Godot C#
General C# rules live in `laa-dotnet`. In Godot specifically:
- Use the .NET editor build. Godot classes must be `partial`, and the file name must match the class name.
- Signals are delegates whose names end in `EventHandler`: `[Signal] public delegate void HealthChangedEventHandler(int newValue);`, raised with `EmitSignal(SignalName.HealthChanged, value)`. Expose fields with `[Export]`.
- Cache `GetNode<T>()` results in `_Ready()`. Avoid allocating in `_Process()`: LINQ, boxing, and `string` building trigger GC pauses.
- Check the platform support table for your Godot version before choosing C# for web or mobile targets.

## Tooling and tests
- **Format and lint**: GDQuest's GDScript Formatter (`gdscript-formatter --check` and `gdscript-formatter lint` in CI) is actively maintained. gdtoolkit (`pipx install "gdtoolkit==4.*"`, then `gdformat --check .` and `gdlint .`) also works, but check it parses your engine version's syntax first: its last release was 4.5.0, in October 2025.
- **Tests**: GUT 9.x for GDScript-only projects (match the GUT release to your Godot minor version), and gdUnit4 for C# or mixed projects. Put tests in `test/` with `test_*.gd` files, for logic in `RefCounted` classes and for scenes instantiated in the test. Inject time and randomness (a seeded `RandomNumberGenerator`) so tests are deterministic.
- **Headless CI** (use the editor binary, not an export template):
  ```sh
  godot --headless --path . --import          # import resources and build the class cache first
  godot --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://test -gexit -gjunit_xml_file=results.xml
  mkdir -p build/linux
  godot --headless --path . --export-release "Linux" build/linux/game.x86_64
  ```
  - Export preset names must match `export_presets.cfg`, and the output directory must exist. Relative output paths resolve against the folder that holds `project.godot`.
  - Export templates must be installed for that exact Godot version. Containers and actions such as `abarichello/godot-ci` and `chickensoft-games/setup-godot` provide them; pin the Godot version.
  - gdUnit4 has its own action, `godot-gdunit-labs/gdUnit4-action@v1` (inputs `godot-version`, `paths`).
  - Signing keys and passwords come from CI secrets, never from the repo.
- Build an export from the first week, and test it on every target platform. Case-sensitivity, `res://` writes, and missing export filters only show up in exported builds.

## Definition of done
No GDScript errors or warnings above the project's levels in the editor · formatter `--check` clean · lint clean · tests green headless · the export builds.

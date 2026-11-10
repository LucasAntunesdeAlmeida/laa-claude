---
name: game-dev-practices
description: Game development process practices for planning, scoping, and validating a game: find and prototype the core loop first, greybox with placeholder art, build a vertical slice and decide go/pivot/stop, scope with MoSCoW and time-boxes, cut scope before quality, playtest early by watching players, and plan milestones (prototype, vertical slice, alpha, beta, release). Use when someone is starting or planning a game, asks "where do I start", "how do I scope my game", "is my game too big", "is my prototype ready", "should I keep going with this idea", "how do I playtest", or wants a game design document, roadmap, or milestone plan, and when /laa:feature is used to plan a game feature.
---

# Game development practices

These are defaults for solo developers and small teams. A studio's own production process overrides them.

## Find the core loop first
- Write the core loop in one sentence: the action the player repeats every 30 seconds to a few minutes, and why they want to do it again. For a farming sim: plant → tend → harvest → sell → buy better seeds.
- Name the 2–3 **design pillars** the game must deliver (for example "cozy", "every day feels different"). Every feature has to serve a pillar, or it waits.
- Everything that isn't the core loop is a multiplier on it. If the loop isn't fun, no amount of content, story, or polish fixes it.

## Prototype
- Prototype only the core loop, in days to two weeks. Use greybox art: primitives, free placeholder assets, no audio polish, no menus.
- One question per prototype ("is planting and harvesting satisfying on its own?"), written down before you start, with the answer written down when you stop.
- Prototype code is disposable. Keep it in its own branch or folder, and rewrite the parts that survive with the project's conventions.
- Prototype the riskiest unknown next: an unusual mechanic, a technical risk (netcode, procedural generation, performance on the weakest target), or a content pipeline you've never built.

## Vertical slice
- A vertical slice is 3–10 minutes of the game at near-final quality: one complete start → challenge → resolution cycle, with real art, audio, UI, and feel for that small piece. It shows what the finished game is like and what one minute of content costs to make.
- End it with an explicit decision: **go** (production), **pivot** (change the loop or pillars and prototype again), or **stop**. Measure the cost of the slice and multiply it out to the full game's content. If the total doesn't fit your time, cut content now.
- Don't add "one more system" to the slice. Systems that aren't needed for one full cycle wait.

## Scope
- Assume everything takes 2–3 times your estimate, and plan for it.
- Sort every feature with MoSCoW: **Must** (the game doesn't work without it), **Should**, **Could**, **Won't (this release)**. Write the Won't list down. It's the most useful part.
- Features that multiply cost and risk belong on the Won't list for a first game, or until a prototype proves they're affordable: online multiplayer, open worlds, procedural generation on top of handcrafted content, branching narrative, crafting economies, many platforms at once.
- Time-box every feature. When the box ends, ship it as it is, give it one more box on purpose, or cut it.
- Cut scope before quality. A short, polished game beats a long, broken one.
- Release something small first (a game jam entry, a demo, a one-mechanic game) when the team hasn't shipped a game before.

## Playtest
- Playtest from the first prototype, every week or two, with people who haven't seen the game.
- Watch, don't help. Say nothing while they play, note where they hesitate, get lost, or quit, and record the session if you can.
- Ask afterwards: what they were trying to do, what was fun, what was frustrating, what they expected to happen. Treat requested solutions as signals of a problem, not as the fix.
- Instrument the build early: where players die, quit, or stall. Numbers from 20 testers beat opinions from 2.
- Test the exported build on the target hardware, not the editor.

## Milestones
1. **Prototype**: the core loop answers its question (fun or not). Decide go or stop.
2. **Vertical slice**: one polished cycle. Decide go, pivot, or stop, and lock scope from its measured cost.
3. **Alpha**: every Must feature works end to end with placeholder content. No new features after alpha.
4. **Beta**: content complete, with bugs, balance, and performance left to fix. Only fixes after beta.
5. **Release**: store page, builds for every target, and a patch plan.

Put a playable build and a playtest at the end of every milestone. A milestone without a playable build didn't happen.

## Production habits
- Keep the game playable at the end of every day. Fix broken builds before writing new features.
- Automate the export from the start, and keep a changelog of what each build changed.
- Keep a design doc short and alive: pillars, core loop, MoSCoW list, and the current milestone's goals. Update it when a playtest changes your mind.
- Use the engine's conventions skill (for Godot, `laa-godot:godot-conventions`) for code, and `/laa:feature` for each feature once the slice is approved.

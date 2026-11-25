# Part 1 – Understanding STILLFRAME

All line numbers refer to the original [`index.html`](index.html) (tag `baseline`, commit `53b6bdc`).
The whole game is that one file: about 7,400 lines of HTML, CSS, WGSL shaders and JavaScript, rendered with **WebGPU**.

## 1. The game in 30 seconds

- **What it is:** a first-person action game (shooter and brawler) made of 15 short arena levels in three acts: Transit, Office Tower and Rooftops ([L3388](index.html#L3388)).
- **Goal:** kill every enemy wave, or on some levels reach an exit zone ([`checkWin`, L5775](index.html#L5775)). One hit kills you, and the level restarts with "AGAIN.". Your best real-time clear time is saved, and after a clear you can watch a replay.
- **Enemies:** glassy humanoids that shatter when they die.
  - *walker*: has a pistol and keeps its distance.
  - *rusher*: fast, fights in melee.
  - *marksman*: has a carbine and shows a laser before it fires.
- **Weapons:** pistol, scatter gun, burst carbine and blade. Bottles, bricks and mugs can be thrown to stun or disarm enemies. Guns can't be reloaded; an empty gun is just something to throw.

### Controls ([L1876](index.html#L1876))

| Input | Action |
|---|---|
| WASD / arrows | move |
| Mouse | look (the game captures the mouse pointer) |
| Left mouse button | does what fits: fire, punch, pick up or throw |
| Right mouse button | throw the held item |
| E | pick up |
| Space | jump |
| R / Esc | restart / pause |
| F2 / F3 / F4 | debug: freeze time / real time / overlay |

A standard gamepad also works.

## 2. The mechanic that makes it special

> **Time moves only when you move.**

`TimeScaleDriver` ([L6161](index.html#L6161)) computes a time scale between 0.015 and 1 every frame:

```
target = max( walk speed / max speed,
              look speed × 0.35,
              1 for 0.12 s after you fire, throw or pick up )
if airborne: target = max(target, 0.8)
```

It rises quickly and falls more slowly. **The player moves in real time**, but enemies, bullets and props advance by `realDt × timeScale`. Standing still nearly freezes the world, so you can watch a bullet coming and step around it.

The rest of the game is built around this:
- Bullets are slow (25 m/s) and get longer trails when time is slow.
- The screen loses colour as time slows, except for the enemies.
- The music gets muffled as time slows.
- The crosshair rotates with the time scale.
- The best time is measured in *real* time, not simulated time.

## 3. Code map

Each subsystem is a section of `index.html`, in this order:

| Subsystem | Lines | Responsibility |
|---|---|---|
| `Gfx` | 509–630 | Starts WebGPU, sets up the canvas, handles resizing and resolution scale |
| Shaders (WGSL strings) | 666–1134 | Scene with shadows, glass with refraction, bullet trails, outlines, bloom, final tonemap and colour grade |
| `Renderer` | 1163–1833 | Groups draws by mesh and layer and runs about 10 render passes per frame |
| `Camera` | 1837 | View and projection matrices from yaw and pitch |
| `Input` | 1876–2054 | Keyboard, mouse, pointer lock and gamepad, turned into named actions ("fire", "jump") |
| `Time` / `Loop` | 2056–2156 | `requestAnimationFrame` loop with a **fixed 1/120 s step**, time scale and interpolation value |
| Math helpers | 2158–2232 | Vector and angle functions on plain arrays |
| `AudioEngine` | 2233–2508 | WebAudio with synthesized sounds, 3D panning, music filtered by the time scale |
| `LevelBuilder` and levels | 2509–3394 | Small building language (room, pillar, crate) and the 15 level definitions |
| `Ui` | 3400–3734 | DOM menus, title-card words, heads-up display |
| Save | 3735–3778 | Settings and best times in `localStorage` |
| `MeshBuilder`, `THEMES` | 3816–3996 | Builds level geometry; colour and lighting themes |
| `StaticWorld` | 3999–4304 | Collision grid of static boxes: raycasts, line of sight, character movement |
| `NavGrid` | 4310–4582 | Walkability grid and A* paths for enemies |
| Enemy AI | 4846–5197 | Enemy state machine: move, aim, laser warning, fire, melee, stun |
| **`World`** | 5221–6053 | **The simulation**: player combat, props, bullets, waves, win and lose checks; produces `events` |
| `PlayerController` | 6071–6159 | First-person movement and look (real time) |
| **`TimeScaleDriver`** | 6161–6190 | **The core mechanic** |
| `FxSystem` | 6195–6454 | Particles, sparks and shards from enemies that shatter |
| `Viewmodel` | 6456–6570 | The player's hands and weapon on screen |
| Replay | 6571–6621 | Records each frame's input and replays it in a fresh `World` |
| **`Game`** | 6704–7387 | **Owns everything**: game-state switch, event handling, draw list |
| `boot()` | 7394 | `Gfx.create` → `new Game` → `start()` |

### Dependencies

```
boot ─► Gfx ─► Game ──owns──► Loop/Time, Input, Ui, AudioEngine, Renderer, FxSystem,
                              Viewmodel, PlayerController, TimeScaleDriver, Replay, Camera
Game ─► World (rebuilt on each restart) ─► StaticWorld, NavGrid, enemy AI, level data
PlayerController ─► StaticWorld (collision)
ReplayPlayer ─► its own World
World ──events[]──► Game.handleEvent ──► AudioEngine, FxSystem
Ui ──callbacks──► Game (onPlayLevel, onRestart, ...)
Game ─► Renderer.drawMesh / drawSegment ─► Renderer.render ─► GPU
```

**Key idea:** `World` is a headless simulation. It doesn't call audio or graphics, it only pushes events. This is what makes the replay possible.

## 4. One frame, from key press to pixels

Example: you press **W** while playing.

1. **The browser delivers the key event between frames.** `Input.onKeyDown` → `press("KeyW")` adds the key to the `down` and `pressedRaw` sets ([L1984](index.html#L1984)).
2. **A new frame starts.** `requestAnimationFrame` calls `Loop.tick(now)` ([L2143](index.html#L2143)). `Time.beginFrame` computes `realDt` (capped at 0.1 s).
3. **`Game.frame`** ([L6957](index.html#L6957)):
   1. `input.update()` moves this frame's presses and mouse movement into place and polls the gamepad.
   2. `PlayerController.update()` applies the mouse look, turns WASD into a velocity using **real** dt, and collides with `StaticWorld`.
   3. `toFrame()` → `World.applyPlayerFrame()` copies the player into the world and runs fire, throw and pick-up (these push events).
   4. The frame is recorded for the replay, and `TimeScaleDriver.update()` sets `t.timeScale`.
4. **The simulation advances.** `realDt × timeScale` is added to an accumulator. `World.step(1/120)` runs once per whole step in it, at most 8 times per frame ([L5676](index.html#L5676)): waves, enemy AI, props, bullets, win check. What is left over becomes `alpha`, used for interpolation.
5. **`Game.render`** ([L7038](index.html#L7038)):
   1. Checks the win and lose flags.
   2. Sends the world's events to audio and effects.
   3. Places the cameras.
   4. Queues the world (positions interpolated with `alpha`) and the viewmodel, then fills in the post-processing settings.
6. **`Renderer.render`** ([L1476](index.html#L1476)) uploads the instance data and runs these passes:
   **shadow → opaque → glass** (refraction) **→ trails → viewmodel → outline → bloom → final** (tonemap, desaturation, vignette, grain, gamma) into the canvas. Then `queue.submit`, and the browser shows the image.
7. The heads-up display (DOM) updates, and the next frame is scheduled.

## 5. Design problems

### P1 – The core mechanic is broken by swapped arguments
The function is declared `update(realDt, planarSpeed, maxSpeed, lookSpeed, airborne, busy)` ([L6177](index.html#L6177)), but it is called as `update(dt, WALK_SPEED, this.player.planarSpeed, …)` ([L6998](index.html#L6998)). So the code computes `4 / speed` instead of `speed / 4`. When you stand still that is `4 / 0 = Infinity`, which is clamped to **1**, so **time always runs at full speed**.

To check: press F4 in a level and watch the `timeScale` line while standing still.

**Why it hurts:** six unlabeled numbers in a row are easy to mix up. There are no tests or types, and the mistake makes no error; the game just feels wrong, and its defining feature is gone.
**Fix:** pass an options object, and add a unit test that "standing still gives about 0.015".

### P2 – `Game` is a ~700-line class with string states checked everywhere
Checks like `state === "title" || state === "results" || state === "paused"` are repeated in `frame`, `render`, `updatePost`, `updateHud` and the audio calls. `render()` also *changes* state: it enters the dead or cleared state and patches the replay ([L7039-7044](index.html#L7039-L7044)).

**Why it hurts:** adding a state means finding every scattered check, and missing one causes subtle bugs. Because drawing also changes the logic, rendering can't be skipped or tested on its own.
**Fix:** one object per state (`enter`, `frame`, `exit`, render settings), and state changes moved out of `render`.

### P3 – The player's state is duplicated and simulated outside the fixed step
`PlayerController` moves the player in `frame()` with real dt. `World.player` is a second copy that `applyPlayerFrame` overwrites every frame ([L5302](index.html#L5302)). Player-versus-enemy collision lives in `PlayerController`, not in `World`.

**Why it hurts:** there are two places for the same facts, so it's always unclear which one is current. The replay must store whole positions plus step counts instead of just inputs, which makes it fragile. The collision rules are split across two classes.

### P4 – Constants are duplicated and conflicting (bundler leftovers)
- Gravity is defined three times: `GRAVITY = 18` (enemies), `GRAVITY2 = 16` (props), `GRAVITY3 = 16` (player).
- Also duplicated: `MAX_PITCH` / `MAX_PITCH2`, `WHITE` / `WHITE2` / `WHITE3`, `lerp` / `lerp2`.
- Many unnamed tuning numbers are written directly into the code (`0.35`, `0.8`, `2.2`, `1.4`, ...).

**Why it hurts:** a designer who changes "gravity" changes only one of the three, and nobody can tell whether the difference is intended. The numbered suffixes show this is generated bundle output: we are maintaining build output, not the readable source modules.

### P5 – One 7,400-line file with debug features shipped
Engine, shaders, game, levels and UI share one module-wide scope. F2 and F3 (freeze time, real time) work in normal play, so anyone can cheat the best times. `debugToggleCamera`, `flyUp` and `flyDown` are bound but never used, and Space is bound to both `jump` and `flyUp`.

**Why it hurts:** nothing can be unit-tested or loaded on its own, every change risks merge conflicts, and dead bindings mislead readers.
**Fix:** split into ES modules with a build step, put debug keys behind a flag, and remove the dead bindings.

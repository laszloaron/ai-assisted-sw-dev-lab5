# Part 2 – From one file to a project

The single 7,400-line `index.html` is now an npm + Vite + TypeScript project
with 36 modules and 9 shader files. **It still behaves exactly like the
original, including its bugs.** This is checked automatically, not by eye
(see [How we know nothing changed](#how-we-know-nothing-changed)). Bugs noticed
along the way are listed in [BUGS.md](BUGS.md), not fixed.

## Quick start

| | |
|---|---|
| `npm install` | once |
| **F5** → "Dev server (Vite + Chrome)" | starts `npm run dev`, opens Chrome with the debugger attached |
| **F5** → "Production build (build + preview + Chrome)" | type-checks, builds `dist/`, serves it, attaches the debugger |
| `npm run build` | `tsc --noEmit && vite build`: fails on any type error |
| `npm run check:equivalence` | proves the build still behaves like the original (tag `baseline`) |

Breakpoints set in `src/**/*.ts` bind in both F5 modes. In dev, Vite serves
source maps; the production build emits them too (`build.sourcemap`). The
debug session stops its server when it ends.

## Folder layout

```
index.html                  page skeleton only (canvas, overlay, "WebGPU required" panel)
src/
  main.ts                   entry point: create the GPU context, start the Game
  styles/main.css           the original stylesheet, unchanged
  engine/                   ── generic technology, knows nothing about this game ──
    gpu/                    Gfx (device, canvas), Mesh (GPU buffers), MeshBuilder (CPU geometry)
    render/                 Renderer (all render passes), Camera
      shaders/*.wgsl        scene, shadow, glass, fx, post, outline, bloom, final (+ common)
    input/Input.ts          keyboard / mouse / gamepad → named actions
    loop/Loop.ts            requestAnimationFrame loop, fixed 1/120 s step, time scale
    audio/                  AudioEngine (WebAudio), synth (procedural sound effects)
    math/                   vec3 helpers, seeded Rng
  game/                     ── STILLFRAME itself ──
    Game.ts                 owns everything: game states, per-frame update, drawing
    TimeScaleDriver.ts      THE core mechanic: how fast time runs
    world/                  the simulation (headless): World, enemy AI, items,
                            StaticWorld (collision), NavGrid (pathfinding), constants
    player/                 PlayerController (movement, look), Viewmodel (hands on screen)
    levels/                 LevelBuilder, one file per act, themes, level → mesh
    visuals/                meshLibrary, enemy pose, FxSystem (particles, shards)
    replay/Replay.ts        record input, replay it in a fresh World
  ui/                       ── DOM ──  Ui (menus, HUD), DebugOverlay, save (localStorage)
tools/equivalence/          headless check against the original (see its README)
.vscode/                    F5 launch configs and tasks
```

Every module starts with a one-line comment saying what it is responsible for.

## Why this split

**1. Three top-level areas: `engine/`, `game/` and `ui/`.** The first question
a newcomer asks is "is this specific to our game or is it plumbing?", and the
folder answers it.
- `engine/` holds things you could reuse in another WebGPU game: device setup,
  the render pipeline, input, the loop, audio and math.
- `game/` is the game itself.
- `ui/` is the HTML side: menus, HUD and save data.

**2. Dependencies only point one way, and that is checked, not hoped for.**
```
main ─► game ─► engine
          └───► ui ─► (game/levels: only the act names)
game/world, game/replay ─► engine/math only  (no rendering, audio or UI)
```
- `engine/` never imports `game/` or `ui/`.
- The simulation (`world/`) never imports rendering, audio or `Game`: it only
  pushes events. That keeps the simulation headless and replayable, which was
  the best property of the original design (Part 1).
- The import graph has no cycles.

**3. Inside `game/`, folders follow the questions people ask.**
- "Why did that enemy do that?" → `world/enemy.ts`.
- "Where is level 2-3?" → `levels/act2-office.ts`.
- "Why are the shards that colour?" → `visuals/`.

Levels are split per act because they are pure data and the biggest part of
the code; a level designer edits one act file and touches nothing else.

**4. `TimeScaleDriver.ts` sits at the top of `game/` on purpose.** It is the
one mechanic that makes this game different (Part 1). It should be the first
thing a newcomer finds, not something buried in `player/`.

**5. Shaders live next to the code that uses them**
(`engine/render/shaders/`), as real `.wgsl` files with editor support. They are
imported with Vite's `?raw`, and the renderer still concatenates them the same
way (`common` + `scene`, `post` + `bloom`, …).

**6. `world/constants.ts` exists to avoid a cycle.** The player constants
(`EYE_HEIGHT`, `REACH`, …) are used by both `World.ts` and `enemy.ts`, and
`World.ts` imports `enemy.ts`. Keeping the constants in `World.ts` would have
made `enemy.ts` import `World.ts` back.

### What I deliberately did not do

- **Rename or merge anything.** `GRAVITY2`, `WHITE3` and `lerp2` are bundler
  leftovers ([BUGS.md](BUGS.md) B7, B8). Merging them would change behaviour,
  for example enemy gravity, and renaming them would make the split diff
  unreviewable.
- **Break up `Game.ts`** (732 lines) or `World.ts` (852 lines). Their
  responsibilities are still one unit each. Splitting them by state or by
  system is a design change, and it is easier to review once these files have
  tests.
- **Strict TypeScript.** The code came from untyped JavaScript, so `strict` is
  off. Annotations were added only where `tsc` needed them. The next step is
  turning on `strict` one folder at a time, starting with `engine/math` and
  `world/`.

## How the change was made (one commit per step)

| Commit | Step |
|---|---|
| `39fafa4` | npm + Vite; the inline `<style>` and `<script>` moved verbatim to `src/` |
| `97d4de4` | headless equivalence check added (used for every step below) |
| `ed2d287` | VS Code F5 configs for dev and production |
| `8ad8160` | `wgpu-matrix` from npm (same pinned 3.4.2; the CDN file is byte-identical to the package's) |
| `52e19e2` | shaders to `.wgsl` files (each checked byte-for-byte against the inline string) |
| `ae54afe` | split into TS modules, **generated** by a script committed with it: review the script and its module table, not 7,000 moved lines |
| `26fab55` | the only hand-written code changes: three option/parameter types; the build now requires a clean `tsc` |
| `60998eb` | remove the one-off split script |

## How we know nothing changed

A screenshot comparison would be weak: the title camera orbits on real time,
and most of the game is behind input. Instead, `npm run check:equivalence`
runs the original file (git tag `baseline`) and the current production build
**headless and side by side**. Both run in a fake browser that records
everything the game does:
- every WebGPU call, including the contents of every buffer upload and the
  full shader source;
- every WebAudio call;
- console warnings;
- the whole DOM and the save data.

Time and `Math.random` are driven by the harness, so a run is deterministic.
Both versions play the same scripted sessions:
- the menus on a fresh save;
- then all 14 reachable levels, with movement, looking around, shooting,
  throwing, picking up, jumping, restart, pause/resume, the debug keys and the
  overlay.

The recordings are compared frame by frame.

Result after every commit above that changed code or build:

```
✔ stylesheet: src/styles/main.css is byte-identical to the original <style>
✔ <head>: same title, meta tags and icon
✔ fresh: 261 frames identical (45949 recorded calls compared)
✔ levels: 13261 frames identical (2550792 recorded calls compared)
```

The check itself was tested by changing tiny things in the built bundle, one
at a time. It caught a 0.4% change in enemy walking speed, a single digit in a
shader and a 0.07% change in throw speed.

**Limits:**
- It proves the same commands reach the GPU, not the pixels a driver produces
  from them.
- The scripted input never clears a level, so the results screen and the
  replay are not exercised. Neither are the settings sliders, gamepads or
  window resizing.

Details are in [tools/equivalence/README.md](tools/equivalence/README.md).

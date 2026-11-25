# Bugs

One entry per bug. Fixed bugs come first, in the order they were fixed. Each
one has a reproduction script in [tools/playtest/repro/](tools/playtest/repro/)
that prints `FAIL` while the bug exists and `PASS` once it is fixed. They run
headless against the real game modules (see
[tools/playtest/playtest.mjs](tools/playtest/playtest.mjs)). Run them all with
`npm run repro`.

## Fixed

### 1. PLAY does nothing on a new save; level 1-1 can never be started

- **Steps:**
  1. Start with no save data (a private window, or clear site data).
  2. Click **PLAY** on the title screen.
- **Expected:** the intro words appear and level 1-1 starts.
- **Actual:** nothing happens; the title screen stays. In **LEVELS**, 1-1 is
  shown as locked, even when every other level is cleared. Every other level
  can be started once the one before it is cleared.
- **Root cause:** [`Ui.isUnlocked`](src/ui/Ui.ts) treated only `index < 0` as
  always unlocked. For the first level (`index 0`) it looked up
  `levels[-1]`, got `undefined`, and returned `false`. `Game.startLevel` returns
  early for locked levels, so the click did nothing.
- **Fix:** `index <= 0` is always unlocked.
- **Verified:** `node tools/playtest/repro/play-button.mjs` → `PASS` (was
  `FAIL state=title`). Levels 2+ are still locked until the previous level is
  cleared.

## Open (noticed, not yet fixed)

- **Time never slows down.** The core mechanic is off: `Game.frame` passes
  `WALK_SPEED` and `planarSpeed` to `TimeScaleDriver.update` in the wrong
  order. The time scale is 1.000 while standing still
  (`repro/time-scale.mjs`).
- **Debug keys work in normal play.** F2 (freeze time) and F3 (real time)
  are always active, so the saved best times are easy to cheat.
- **Replay hand-bob uses the distance from the world origin**, not the
  distance walked (`Game.render`, `stride` during a replay).
- **Hand sway gets a stale mouse movement while paused.**
  `Viewmodel.update` is fed `player.mouseDx/Dy`, which is not updated while
  paused.
- **Enemy aim pitch is not interpolated**, unlike every other pose input
  (`Game.drawEnemy`).
- **Three gravities:** 18 for enemies, 16 for props and the player
  (`GRAVITY`, `GRAVITY2`, `GRAVITY3`).
- **Two pitch limits:** `MAX_PITCH` (camera) and `MAX_PITCH2` (player).
- **Unused input bindings:** `debugToggleCamera`, `flyUp` (Space, also
  bound to jump) and `flyDown` are never read. `Input.wasReleased` is unused
  and ignores the gamepad.
- **The player/enemy push distance hardcodes 0.3** instead of
  `ENEMY_RADIUS`.

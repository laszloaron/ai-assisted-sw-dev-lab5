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

### 2. Time never slows down: the core mechanic is off

- **Steps:**
  1. Start level 1-1.
  2. Stand still and don't touch the mouse.
- **Expected:** "time moves only when you move". Enemies and bullets nearly
  freeze while you stand still, and run at full speed while you walk.
- **Actual:** everything always runs at full speed. With F4, the overlay shows
  `timeScale 1.000` whether you stand still or walk. The crosshair never
  rotates and the screen never loses its colour. It never happens differently:
  there is no slow motion at all.
- **Root cause:** in [`Game.frame`](src/game/Game.ts), the call
  `driver.update(dt, WALK_SPEED, planarSpeed, …)` swaps two arguments of
  [`TimeScaleDriver.update(realDt, planarSpeed, maxSpeed, …)`](src/game/TimeScaleDriver.ts).
  So the code computes `4 / speed` instead of `speed / 4`. Standing still,
  that is `4 / 0 = Infinity`, which is clamped to 1, so time always runs at
  full speed.
- **Fix:** pass `planarSpeed, WALK_SPEED` in the declared order.
- **Verified:** `node tools/playtest/repro/time-scale.mjs` → `PASS standing
  0.015, walking 1.000, stopped again 0.015` (was 1.000 / 1.000 / 1.000).

### 3. In 1-2 the player starts on the roof of the train carriage

- **Steps:** start level 1-2 (CARRIAGE) and don't move.
- **Expected:** you start inside the carriage, between the two walkers.
- **Actual:** you start standing on the carriage roof, about 3 m up. The
  walkers inside can't see you, and the rushers of the second wave stand under
  you and can't reach you, so the level can never be cleared. Only this level
  shows it so obviously. The same mistake (a spawn overlapping geometry) puts
  20 spawns in 9 levels inside or on top of crates, poles and walls: for
  example, the 1-3 rushers start on top of 2.4 m crates.
- **Root cause:** spawn points are points, but characters are 0.6 m wide. The
  1-2 player spawn (0, 0, 0) is inside the grab pole at z = 0, and many enemy
  spawns are on the edge of a crate. Nothing moved a spawning character out of
  geometry. Then [`StaticWorld.moveAxis`](src/game/world/StaticWorld.ts), on
  the first downward (gravity) move, snaps any overlapping character on top of
  the box it overlaps, however deep inside it is.
- **Fix:** new `StaticWorld.findFreeSpot(pos, r, h)` returns the spawn point
  if it is free, otherwise the nearest free spot within 3 m that has a floor
  under it. `World` uses it for the player spawn and every enemy spawn;
  `Game.resetWorld` puts the player controller there. The level data is
  unchanged.
- **Verified:**
  - `node tools/playtest/repro/level-spawns.mjs` checks all 130 spawns in all
    15 levels → `PASS`: 20 nudged out of geometry, none left inside, all with
    a floor.
  - The bot (`node tools/playtest/bot-run.mjs 1`) now starts 1-2 inside the
    carriage and fights the enemies.
  - The level 3-5 rushers are moved 2.3 m. That is reported as a warning for
    level design, see Open.

### 4. Rushers kill the player through walls

- **Steps:**
  1. Start level 1-2 and kill the two walkers. The second wave starts: two
     rushers outside the carriage.
  2. Stand inside the carriage close to the right-hand wall, opposite where a
     rusher runs past outside, about 1.5 m from it.
- **Expected:** the rusher has to come in through a door before it can hit
  you; a wall protects you.
- **Actual:** you die while the rusher is still outside, on the other side of
  the wall. You can't see it or shoot it. It only happens with a thin wall
  between you, within about 1.5 m; in the open, melee works as intended.
- **Root cause:** [`updateEnemy`](src/game/world/enemy.ts) started a melee
  attack when the player was in range and in front of the enemy, ignoring line
  of sight. `meleeStrike` then killed the player based on distance, facing and
  height only. Neither checked for walls.
- **Fix:** an attack only starts when the enemy can see the player (`canSee`,
  which includes line of sight). The strike, about 0.36 s later, only lands if
  the line between the two chests is still clear, so the player can step
  behind cover in time.
- **Verified:** `node tools/playtest/repro/melee-through-wall.mjs` → `PASS`.
  - Behind the wall, the player is now only killed after the rusher walks
    round through the door (kill from inside, in plain sight).
  - In the open, the rusher still kills.
  - With the fix removed, the same test reports `FAIL … THROUGH THE WALL`.

## Open (noticed, not yet fixed)

- **Level 3-5 rusher spawns are deep inside a building block** at (±14, 0),
  so they are moved 2.3 m (`repro/level-spawns.mjs` warning). Act 3 needs a
  level-design pass.
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

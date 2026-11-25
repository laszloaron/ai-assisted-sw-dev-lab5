# Known bugs (not fixed yet)

Things that look wrong, noticed while analysing and refactoring the game.
**None of them is fixed**: the refactor keeps the original behaviour exactly,
and the equivalence check (`npm run check:equivalence`) proves it. Each one
should be fixed in its own reviewable change.

Paths point to the refactored code. Status:
- **confirmed**: reproduced in the headless equivalence run.
- **from reading**: seen in the code, not reproduced yet.

## Gameplay

### B1. Time never slows down: the core mechanic is off (confirmed)
[src/game/Game.ts](src/game/Game.ts) calls
`driver.update(dt, WALK_SPEED, this.player.planarSpeed, …)`, but
[`TimeScaleDriver.update`](src/game/TimeScaleDriver.ts) is declared as
`update(realDt, planarSpeed, maxSpeed, …)`. The arguments are swapped, so the
code computes `4 / speed` instead of `speed / 4`. When you stand still that is
`4 / 0 = Infinity`, which is clamped to 1, so the time scale is always 1.
**Why it looks wrong:** the title screen says "time moves only when you move".
In the headless run the debug overlay shows `timeScale 1.000` while the
player stands still.

### B2. Level 1-1 can never be started; PLAY does nothing on a fresh save (confirmed)
`Ui.isUnlocked(index)` in [src/ui/Ui.ts](src/ui/Ui.ts) returns `true` only for
`index < 0`. For `index = 0`, `levels[-1]` is `undefined`, so it returns
`false`. `Game.startLevel` returns early for locked levels.
**Why it looks wrong:** the first level should always be unlocked. A new
player clicks PLAY and nothing happens, and the levels screen shows 1-1 as
locked even when every other level is cleared. The check was probably meant
to be `index <= 0`.

### B3. Debug time keys work in normal play (from reading)
F2 (freeze time) and F3 (real time) are handled in `Game.frame` in every build.
**Why it looks wrong:** F2 freezes the world while the player keeps moving,
which makes the saved real-time best times easy to cheat.

## Replay and viewmodel

### B4. Replay hand-bob uses the distance from the world origin (from reading)
In `Game.render`, the stride passed to `Viewmodel.draw` during a replay is
`Math.hypot(current.pos[0], current.pos[2])`. That is the player's distance
from (0, 0), not the distance walked (`PlayerController.stride` in live play).
**Why it looks wrong:** the hands bob differently in the replay than in the
recorded play, and they bob even while the player stands still away from the
origin.

### B5. Hand sway gets a stale mouse movement while paused or after a clear (from reading)
`Viewmodel.update` is fed `this.player.mouseDx/mouseDy`, which only
`PlayerController.look()` updates. `look()` isn't called in the `paused` state,
so the last mouse movement before pausing is fed again on every frame.
**Why it looks wrong:** the hands should settle when there is no input.

### B6. Enemy aim pitch is not interpolated (from reading)
`Game.drawEnemy` passes `e.aimPitch` directly, while every other pose input
(position, yaw, walk phase, aim blend, …) is interpolated between the previous
and current simulation step with `alpha`.
**Why it looks wrong:** this probably causes small visible steps in the
enemies' arm angle when time is slow.

## Inconsistencies and dead code

### B7. Three different gravities (from reading)
Enemies use `GRAVITY = 18` ([enemy.ts](src/game/world/enemy.ts)); props and
the player use `GRAVITY2 = 16` ([constants.ts](src/game/world/constants.ts))
and `GRAVITY3 = 16` ([PlayerController.ts](src/game/player/PlayerController.ts)).
**Why it looks wrong:** enemies fall faster than everything else, and the
numbered names suggest copies that drifted apart, not a design decision.

### B8. Two different pitch limits (from reading)
`MAX_PITCH` (camera) is `π/2 − 0.001`; `MAX_PITCH2` (player) is `π/2 − 0.02`.
**Why it looks wrong:** this is harmless today, because the player limit is
the tighter one, but it is another duplicated constant with two values.

### B9. Unused input bindings, and Space bound twice (from reading)
`debugToggleCamera` (F1), `flyUp` (Space) and `flyDown` (Shift/Ctrl) are bound
in [Input.ts](src/engine/input/Input.ts) but never read anywhere.
`Input.wasReleased` is never called, and unlike `isDown`/`wasPressed` it
ignores the gamepad.
**Why it looks wrong:** these are leftovers of a removed free-fly camera.
Space being both `jump` and `flyUp` is a trap for whoever brings it back.

### B10. Player/enemy push distance hardcodes the enemy radius (from reading)
`PlayerController.update` uses `PLAYER_RADIUS + 0.3` instead of
`PLAYER_RADIUS + ENEMY_RADIUS`.
**Why it looks wrong:** the values match today (`ENEMY_RADIUS` is 0.3), but
changing the enemy size would silently not change the collision.

// Repro / regression check: nobody may start inside solid geometry.
//
// The level data places 20 spawns (in 9 levels) right on the edge of a crate,
// pole or wall: points, while characters are 0.6 m wide. A character that
// starts inside a box gets snapped onto its top by StaticWorld.moveAxis; in
// 1-2 that put the player on the carriage roof, out of reach of the enemies,
// so the level could not be cleared.
//
// Checks, for every spawn in all 15 levels, the position the game actually
// uses (after StaticWorld.findFreeSpot): free of geometry, with a floor under
// it, and close to where the level designer put it.
import { startGame } from "../playtest.mjs";

const pt = await startGame();
const { LEVELS } = await pt.load("/src/game/levels/index.ts");
const { StaticWorld } = await pt.load("/src/game/world/StaticWorld.ts");
const PLAYER = [0.3, 1.75], ENEMY = [0.3, 1.8];

const problems = [];
const warnings = [];
let moved = 0, total = 0;
for (const def of LEVELS) {
  const sw = new StaticWorld(def.boxes.filter((b) => b.collide).map((b) => ({ min: [...b.min], max: [...b.max] })));
  const check = (what, p, [r, h]) => {
    total++;
    const q = sw.findFreeSpot(p, r, h);
    const inside = sw.overlapsAabb([q[0] - r, q[1] + 0.06, q[2] - r], [q[0] + r, q[1] + h, q[2] + r]);
    const floor = sw.raycast([q[0], q[1] + 0.3, q[2]], [0, -1, 0], 1.3);
    const d = Math.hypot(q[0] - p[0], q[2] - p[2]);
    if (d > 0) moved++;
    if (inside) problems.push(`${def.id}: ${what} at (${p.join(", ")}) is still inside geometry`);
    else if (!floor) problems.push(`${def.id}: ${what} moved to (${q.map((v) => v.toFixed(2))}) which has no floor`);
    else if (d > 1.5) warnings.push(`${def.id}: ${what} moved ${d.toFixed(2)} m from its designed spot`);
  };
  check("player spawn", def.player.pos, PLAYER);
  for (const w of def.waves)
    for (const s of w.spawns) check(`${s.kind} spawn`, s.pos.length === 2 ? [s.pos[0], 0.05, s.pos[1]] : [s.pos[0], s.pos[1] + 0.05, s.pos[2]], ENEMY);
}
for (const p of problems) console.log("  " + p);
for (const w of warnings) console.log("  warning (level design should check): " + w);
console.log(`${problems.length ? "FAIL" : "PASS"} level-spawns: ${total} spawns checked, ${moved} nudged out of geometry, ${problems.length} problem(s)`);
await pt.close();
process.exit(problems.length ? 1 : 0);

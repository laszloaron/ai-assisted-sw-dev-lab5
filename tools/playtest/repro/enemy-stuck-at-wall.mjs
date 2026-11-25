// Repro: an enemy close to the player but on the other side of a wall must
// walk around (through a door), not push into the wall forever.
// Level 1-2: player inside the carriage at z = -10, rusher outside at 1.4 m;
// the nearest door is at z = -5. A rusher runs 5.2 m/s, so it should arrive
// within a few seconds (and then kill the standing player).
import { startGame } from "../playtest.mjs";

const pt = await startGame();
const { LEVELS } = await pt.load("/src/game/levels/index.ts");
const { World } = await pt.load("/src/game/world/World.ts");
const { createEnemy } = await pt.load("/src/game/world/enemy.ts");

const w = new World(LEVELS[1]);
w.enemies.length = 0;
w.spawnQueue.length = 0;
w.waveIndex = w.def.waves.length;
const playerPos = [0.7, 0, -10];
w.player.pos = [...playerPos];
const e = createEnemy(99, "rusher", [2.1, 0, -10], Math.PI / 2, null, false, 0.5);
e.spawnT = 1;
e.state = "pursue";
w.enemies.push(e);
let t = 0;
for (; t < 15 && w.player.alive; t += 1 / 120) {
  w.player.pos = [...playerPos];
  w.step(1 / 120);
}
const ok = !w.player.alive && t < 8;
console.log(`${ok ? "PASS" : "FAIL"} enemy-stuck-at-wall: ${w.player.alive ? `rusher still at (${e.pos.map((v) => v.toFixed(1))}) after ${t.toFixed(1)} s` : `rusher reached the player after ${t.toFixed(1)} s`}`);
await pt.close();
process.exit(ok ? 0 : 1);

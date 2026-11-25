// Repro: a rusher must not be able to punch the player through a wall.
// Level 1-2: player inside the carriage, rusher outside, 1.4 m apart with the
// carriage wall (x = 1.5 .. 1.8) between them. The rusher may walk around
// through a door and kill the player from inside, but a kill must never land
// while the wall is between them. Control: same distance in the open; the
// rusher must still kill the player there.
import { startGame } from "../playtest.mjs";

const pt = await startGame();
const { LEVELS } = await pt.load("/src/game/levels/index.ts");
const { World } = await pt.load("/src/game/world/World.ts");
const { createEnemy } = await pt.load("/src/game/world/enemy.ts");

function duel(playerPos, rusherPos) {
  const w = new World(LEVELS[1]);
  w.enemies.length = 0;
  w.spawnQueue.length = 0;
  w.waveIndex = w.def.waves.length; // no more waves
  w.player.pos = [...playerPos];
  const yaw = Math.atan2(-(playerPos[0] - rusherPos[0]), -(playerPos[2] - rusherPos[2]));
  const e = createEnemy(99, "rusher", rusherPos, yaw, null, false, 0.5);
  e.spawnT = 1;
  e.state = "pursue";
  w.enemies.push(e);
  for (let i = 0; i < 120 * 3 && w.player.alive; i++) {
    w.player.pos = [...playerPos]; // the player stands still
    w.step(1 / 120);
  }
  const chest = (p) => [p[0], p[1] + 1.3, p[2]];
  return { killed: !w.player.alive, sawPlayer: w.static.lineClear(chest(e.pos), chest(playerPos)), at: e.pos.map((v) => v.toFixed(1)).join(", ") };
}

const wall = duel([0.7, 0, -10], [2.1, 0, -10]);
const open = duel([0.7, 0, -10], [0.7, 0, -8.6]);
const ok = (!wall.killed || wall.sawPlayer) && open.killed;
const describe = (r) => (r.killed ? `killed by the rusher at (${r.at}) ${r.sawPlayer ? "in plain sight" : "THROUGH THE WALL"}` : "survives");
console.log(`${ok ? "PASS" : "FAIL"} melee-through-wall: behind the wall the player ${describe(wall)}; in the open the player ${describe(open)}`);
await pt.close();
process.exit(ok ? 0 : 1);

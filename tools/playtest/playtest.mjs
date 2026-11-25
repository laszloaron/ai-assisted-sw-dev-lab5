// Headless play-testing: runs the real game modules from src/ (through Vite)
// inside the recording fake browser of the equivalence check, and gives a
// script direct access to the Game object, so a bug can be reproduced as a
// short, repeatable sequence of inputs with the world state checked in code.
//
//   import { startGame } from "./playtest.mjs";
//   const pt = await startGame({ unlockAll: true });
//   pt.playLevel(0); await pt.frames(120); console.log(pt.world.enemies.length);
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { installEnvironment } from "../equivalence/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LEVEL_IDS = [1, 2, 3].flatMap((act) => [1, 2, 3, 4, 5].map((n) => `${act}-${n}`));

export async function startGame({ unlockAll = false, settings = {}, cleared = [] } = {}) {
  const levels = {};
  for (const id of unlockAll ? LEVEL_IDS : cleared) levels[id] = { cleared: true, best: 99, bestSim: 9 };
  const storage = { "stillframe.save": JSON.stringify({ version: 1, settings, levels }) };
  const { log, error, warn } = console;
  const env = installEnvironment({ html: fs.readFileSync(path.join(root, "index.html"), "utf8"), storage });
  Object.assign(console, { log, error, warn }); // the recording env silences these; scripts need them
  const vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom" });
  const load = (p) => vite.ssrLoadModule(p);
  const { Gfx } = await load("/src/engine/gpu/Gfx.ts");
  const { Game } = await load("/src/game/Game.ts");
  const gfx = await Gfx.create(env.canvas, () => {});
  const game = new Game(gfx, env.canvas, env.document.getElementById("overlay"));
  game.start();
  await env.waitForFirstFrame();

  const pt = {
    env,
    game,
    load,
    get world() { return game.world; },
    get state() { return game.state; },
    get timeScale() { return game.loop.time.effectiveScale(); },
    /** advance n frames at 60 Hz; `each(i)` runs before every frame */
    async frames(n, each) {
      for (let i = 0; i < n; i++) {
        each?.(i);
        await env.tick(16.667);
        env.log.length = 0; // recorded calls aren't needed here
      }
    },
    /** run frames until cond() is true (or the limit); returns frames used, or -1 */
    async until(cond, limit = 6000, each) {
      for (let i = 0; i < limit; i++) {
        if (cond()) return i;
        each?.(i);
        await env.tick(16.667);
        env.log.length = 0;
      }
      return cond() ? limit : -1;
    },
    click: (sel) => env.click(sel),
    has: (sel) => env.has(sel),
    key: (code, down) => env.key(down ? "keydown" : "keyup", code),
    async tap(code) { env.key("keydown", code); await pt.frames(1); env.key("keyup", code); },
    async mouseClick(button = 0) {
      env.mouse("mousedown", button);
      await pt.frames(1);
      env.mouse("mouseup", button, env.window);
    },
    /** turn the view by mouse movement until it looks at `target` (world point) */
    lookAt(target) {
      const p = game.player;
      const eye = [p.pos[0], p.pos[1] + 1.6, p.pos[2]];
      const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const s = 22e-4 * game.save.settings.sensitivity;
      let dyaw = (yaw - p.yaw) % (2 * Math.PI);
      if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      env.mouseMove(dyaw / s, -(pitch - p.pitch) / s * (game.save.settings.invertY ? -1 : 1));
    },
    /** title screen -> levels screen -> level i, then wait for the intro to finish */
    async playLevel(i) {
      if (!pt.has('button[data-level]')) pt.click('button[data-act="levels"]');
      await pt.frames(2);
      pt.click(`button[data-level="${i}"]`);
      await pt.frames(2);
      return pt.until(() => game.state === "playing", 600);
    },
    async close() { await vite.close(); },
  };
  return pt;
}

export { LEVEL_IDS };

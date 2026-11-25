// Bot plays the given levels (default: 1-1, 1-2, 1-3) and reports the outcome.
// Usage: node tools/playtest/bot-run.mjs [levelIndex ...]
import { startGame } from "./playtest.mjs";
import { botPlay } from "./bot.mjs";
const levels = process.argv.slice(2).map(Number);
const pt = await startGame({ unlockAll: true });
for (const i of levels.length ? levels : [0, 1, 2]) {
  const r = await botPlay(pt, i, { log: process.env.BOT_LOG ? console.log : undefined });
  console.log(`level ${pt.game.def.id}: ${JSON.stringify(r)}`);
  // back to the title screen
  if (pt.state !== "title") {
    pt.game.toMenu();
    await pt.frames(2);
  }
}
await pt.close();

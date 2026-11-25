// Repro: on a fresh save, clicking PLAY must start level 1-1.
import { startGame } from "../playtest.mjs";
const pt = await startGame();
await pt.frames(30);
pt.click('button[data-act="play"]');
await pt.frames(5);
const ok = pt.state === "intro" && pt.game.def.id === "1-1";
console.log(`${ok ? "PASS" : "FAIL"} play-button: state=${pt.state} level=${pt.game.def.id}`);
await pt.close();
process.exit(ok ? 0 : 1);

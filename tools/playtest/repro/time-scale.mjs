// Repro: the core mechanic. Standing still, time must (nearly) stop;
// walking at full speed it must run at full speed.
import { startGame } from "../playtest.mjs";
const pt = await startGame({ unlockAll: true });
await pt.playLevel(0);
await pt.frames(60);                       // stand still for 1 s
const still = pt.timeScale;
pt.key("KeyW", true); await pt.frames(30); // walk for 0.5 s
const walking = pt.timeScale;
pt.key("KeyW", false); await pt.frames(60);
const stoppedAgain = pt.timeScale;
const ok = still < 0.05 && walking > 0.9 && stoppedAgain < 0.05;
console.log(`${ok ? "PASS" : "FAIL"} time-scale: standing ${still.toFixed(3)}, walking ${walking.toFixed(3)}, stopped again ${stoppedAgain.toFixed(3)}`);
await pt.close();
process.exit(ok ? 0 : 1);

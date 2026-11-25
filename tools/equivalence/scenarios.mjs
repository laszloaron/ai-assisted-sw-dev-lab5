// Scripted play sessions. Each scenario is a list of [frame, action] pairs;
// the runner advances one 60 Hz frame at a time and fires the actions due.
// The input is crude (no aiming), but it drives every system: menus, intro
// cards, movement, look, all fire/throw/pick-up paths, restart, death,
// pause/resume, debug keys and the overlay, on every level.

const SAVE_KEY = "stillframe.save";
const LEVEL_IDS = [1, 2, 3].flatMap((act) => [1, 2, 3, 4, 5].map((n) => `${act}-${n}`));

const press = (code) => (env) => env.key("keydown", code);
const release = (code) => (env) => env.key("keyup", code);
const tap = (code) => [press(code), release(code)];

/** One gameplay session on the current level, starting at frame `t`. */
function playSession(t) {
  const a = [];
  const at = (f, ...fns) => fns.flat().forEach((fn) => a.push([t + f, fn]));
  const every = (from, to, step, ...fns) => { for (let f = from; f < to; f += step) at(f, ...fns); };
  // 0-150: intro card, then standing still (time should crawl)
  at(150, press("KeyW"));
  every(150, 210, 1, (env) => env.mouseMove(3, 0));
  at(210, release("KeyW"), (env) => env.mouse("mousedown", 0));
  at(213, (env) => env.mouse("mouseup", 0, env.window));
  at(215, press("KeyD"));
  every(215, 260, 1, (env) => env.mouseMove(0, -2));
  at(260, release("KeyD"), press("KeyE"));
  at(262, release("KeyE"));
  at(270, (env) => env.mouse("mousedown", 2));
  at(272, (env) => env.mouse("mouseup", 2, env.window));
  at(280, ...tap("Space"));
  at(290, press("KeyW"), press("KeyA"));
  every(290, 400, 1, (env) => env.mouseMove(-2, 1));
  every(295, 400, 20, (env) => env.mouse("mousedown", 0), (env) => env.mouse("mouseup", 0, env.window));
  at(400, release("KeyW"), release("KeyA"), ...tap("F4"));
  at(420, ...tap("KeyR"));
  at(560, press("KeyS"));
  every(560, 620, 15, (env) => env.mouse("mousedown", 0), (env) => env.mouse("mouseup", 0, env.window));
  // pause by losing pointer lock; if the player happened to be dead the pause
  // screen doesn't open, so click the canvas to re-lock instead (both builds
  // see the same state, so this stays deterministic)
  at(620, release("KeyS"), (env) => env.unlockPointer());
  at(640, (env) => (env.has('button[data-act="resume"]') ? env.click('button[data-act="resume"]') : env.canvas.click()));
  at(660, press("KeyW"), ...tap("F2"));
  every(660, 720, 1, (env) => env.mouseMove(4, 0));
  at(690, ...tap("F2"), ...tap("F3"));
  at(720, release("KeyW"), ...tap("F3"), ...tap("F4"));
  // back to the title screen, retrying until the pause menu shows up
  for (let k = 0; k < 6; k++) {
    at(740 + k * 20, (env) => { if (!env.has(".screen.title:not([hidden])")) (env.locked ? env.unlockPointer() : env.canvas.click()); });
    at(750 + k * 20, (env) => { if (env.has('button[data-act="menu"]')) env.click('button[data-act="menu"]'); });
  }
  return { actions: a, length: 870 };
}

export const SCENARIOS = {
  /** Fresh save: title screen, menus, and the PLAY button. */
  fresh: () => {
    const a = [
      [90, (env) => env.click('button[data-act="play"]')],
      [120, (env) => env.click('button[data-act="settings"]')],
      [140, (env) => env.click('button[data-act="back"]')],
      [160, (env) => env.click('button[data-act="levels"]')],
      [180, (env) => env.click('button[data-level="0"]')],
      [190, (env) => env.click('button[data-act="back"]')],
    ];
    return { storage: null, actions: a, frames: 260 };
  },
  /** Every level marked cleared: play each unlocked level in turn. */
  levels: () => {
    const levels = Object.fromEntries(LEVEL_IDS.map((id, i) => [id, { cleared: true, best: 30 + i, bestSim: 5 + i }]));
    const storage = { [SAVE_KEY]: JSON.stringify({ version: 1, settings: {}, levels }) };
    const a = [];
    let t = 30;
    for (let i = 0; i < LEVEL_IDS.length; i++) {
      a.push([t, (env) => env.click('button[data-act="levels"]')]);
      a.push([t + 10, (env) => env.click(`button[data-level="${i}"]`)]);
      const s = playSession(t + 10);
      a.push(...s.actions);
      t += 10 + s.length;
    }
    return { storage, actions: a, frames: t + 30 };
  },
};

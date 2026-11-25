// A simple player bot for headless play-tests. It is not clever, it is
// predictable: aim at the nearest visible enemy, shoot when the gun is ready,
// sidestep enemy bullets, pick up guns, throw anything else, punch when empty.
// If this bot dies in a way it could not avoid, or gets stuck, a human player
// will hit the same problem.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const GUNS = new Set(["pistol", "scatter", "carbine"]);

export function makeBot(pt, { log = () => {} } = {}) {
  const held = { W: false, A: false, S: false, D: false };
  const setKey = (k, down) => {
    if (held[k] === down) return;
    held[k] = down;
    pt.key(`Key${k}`, down);
  };
  let mouseHeld = 0;
  let strafeDir = 1;
  let strafeTimer = 0;

  function eye() {
    const p = pt.game.player.pos;
    return [p[0], p[1] + 1.6, p[2]];
  }
  function aimError(target) {
    const p = pt.game.player;
    const d = sub(target, eye());
    const yaw = Math.atan2(-d[0], -d[2]);
    const pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
    let dy = (yaw - p.yaw) % (2 * Math.PI);
    if (dy > Math.PI) dy -= 2 * Math.PI;
    if (dy < -Math.PI) dy += 2 * Math.PI;
    return Math.hypot(dy, pitch - p.pitch);
  }
  function visibleEnemies() {
    const w = pt.world;
    const e0 = eye();
    return w.enemies
      .filter((e) => e.alive && e.spawnT >= 1)
      .map((e) => ({ e, chest: [e.pos[0], e.pos[1] + 1.2, e.pos[2]] }))
      .filter((t) => w.static.lineClear(e0, t.chest))
      .sort((a, b) => len(sub(a.chest, e0)) - len(sub(b.chest, e0)));
  }
  function incomingBullet() {
    const w = pt.world;
    const e0 = eye();
    for (const b of w.projectiles) {
      if (!b.alive || b.ownerId === 0) continue;
      const rel = sub(e0, b.pos);
      const d = len(rel);
      const v = len(b.vel);
      if (d > 8 || v < 1e-3) continue;
      const cos = (rel[0] * b.vel[0] + rel[1] * b.vel[1] + rel[2] * b.vel[2]) / (d * v);
      if (cos > 0.97) return b;
    }
    return null;
  }

  /** one decision per frame; call before pt.frames(1) */
  return function step() {
    const w = pt.world;
    const P = w.player;
    if (pt.state !== "playing" || !P.alive) {
      for (const k of Object.keys(held)) setKey(k, false);
      return;
    }
    if (mouseHeld > 0 && --mouseHeld === 0) {
      pt.env.mouse("mouseup", 0, pt.env.window);
      pt.env.mouse("mouseup", 2, pt.env.window);
    }
    const targets = visibleEnemies();
    const item = P.held;
    const bullet = incomingBullet();
    let move = null; // "toward" | "strafe" | null
    let aimAt = null;
    let action = null;

    if (item && GUNS.has(item.kind) && item.ammo > 0) {
      if (targets.length) {
        aimAt = targets[0].chest;
        if (P.fireCooldown <= 0 && P.burstLeft === 0 && aimError(aimAt) < 0.03) action = 0;
        else if (P.fireCooldown > 0) move = "strafe"; // time has to pass for the gun to be ready
      } else move = "toward-any";
    } else {
      const gun = w.props.find((pr) => pr.alive && !pr.thrown && GUNS.has(pr.item.kind) && len(sub(pr.pos, P.pos)) < 12 && Math.abs(pr.pos[1] - P.pos[1]) < 1.5);
      if (gun && !(item && GUNS.has(item.kind) && item.ammo > 0)) {
        aimAt = gun.pos;
        move = "toward";
        if (w.aimProp === gun || len(sub(gun.pos, P.pos)) < 1.2) action = "E";
      } else if (item && targets.length) {
        aimAt = [targets[0].e.pos[0], targets[0].e.pos[1] + 1.5, targets[0].e.pos[2]];
        if (len(sub(aimAt, eye())) < 9 && aimError(aimAt) < 0.05) action = 2;
        else move = "toward";
      } else if (targets.length) {
        aimAt = targets[0].chest;
        move = "toward";
        if (len(sub(aimAt, eye())) < 1.6 && P.punchCooldown <= 0 && aimError(aimAt) < 0.3) action = 0;
      } else move = "toward-any";
    }

    if (move === "toward-any") {
      const any = w.enemies.find((e) => e.alive);
      if (any) { aimAt = [any.pos[0], any.pos[1] + 1.2, any.pos[2]]; move = "toward"; }
      else move = "strafe"; // between waves: keep moving so time (and the next wave) comes
    }
    if (aimAt) pt.lookAt(aimAt);
    if (bullet) move = "strafe";
    if (--strafeTimer <= 0) { strafeDir = -strafeDir; strafeTimer = 20; }
    setKey("W", move === "toward");
    setKey("A", move === "strafe" && strafeDir < 0);
    setKey("D", move === "strafe" && strafeDir > 0);
    if (action === "E") {
      pt.key("KeyE", true);
      pt.key("KeyE", false);
    } else if (action !== null && mouseHeld === 0) {
      pt.env.mouse("mousedown", action);
      mouseHeld = 2;
      log(`${action === 0 ? "fire" : "throw"} at t=${w.simTime.toFixed(2)}`);
    }
  };
}

/** Plays level i with the bot until it is cleared, or `attempts` deaths. */
export async function botPlay(pt, i, { attempts = 5, maxFrames = 60 * 90, log = () => {} } = {}) {
  const started = await pt.playLevel(i);
  if (started < 0) return { cleared: false, deaths: 0, reason: `could not start (state ${pt.state})` };
  const bot = makeBot(pt, { log });
  let deaths = 0;
  const causes = [];
  for (let f = 0; f < maxFrames; f++) {
    bot();
    const before = pt.state;
    await pt.frames(1);
    if (before === "playing" && pt.state === "dead") {
      deaths++;
      causes.push(describeDeath(pt));
      if (deaths >= attempts) break;
    }
    if (pt.state === "cleared" || pt.state === "results") return { cleared: true, deaths, causes, seconds: pt.game.runRealTime };
  }
  return { cleared: false, deaths, causes, state: pt.state, enemiesLeft: pt.world.remainingEnemies };
}

function describeDeath(pt) {
  const w = pt.world;
  const p = w.player.pos;
  const near = w.enemies.filter((e) => e.alive).map((e) => `${e.kind}@${Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]).toFixed(1)}m`);
  return `t=${w.simTime.toFixed(2)}s at (${p.map((x) => x.toFixed(1)).join(",")}), enemies: ${near.join(" ")}`;
}

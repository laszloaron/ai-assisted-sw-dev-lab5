// One-off, mechanical refactoring: splits src/main.js (the original inline
// script) into TypeScript modules. Kept in the history so the split commit can
// be reviewed by reading this script and MODULES below instead of 7000 moved
// lines, and re-run to check the commit is exactly its output:
//
//   git checkout <commit before the split> && node tools/refactor/split-modules.mjs
//
// What it does, and nothing else:
//  1. cuts the file into its top-level declarations (the original was bundler
//     output, so every top-level name is unique);
//  2. moves each declaration, unchanged, to the module MODULES assigns it to;
//  3. minimal syntax changes: `var X = class _X {` -> `class X {`,
//     top-level `var` -> `const` (`let` if reassigned), `export` on names
//     other modules use;
//  4. adds the imports each module needs, then drops the false positives
//     (names that only appeared as object keys) using `tsc --noUnusedLocals`.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const SRC = path.join(root, "src/main.js");

/** module -> [one-line responsibility, top-level names it owns] */
const MODULES = {
  "src/main.ts": ["Entry point: creates the GPU context and starts the game.", "boot"],
  "src/engine/math/vec3.ts": ["Small vector and angle helpers on plain [x, y, z] arrays.", "v3 set copy scale lerp dot lenSq len distSq distXZ normalize clamp lerpN approach angleDiff lerpAngle turnToward yawOf dirFromYawPitch"],
  "src/engine/math/Rng.ts": ["Seeded random number generator (deterministic simulation and replays).", "Rng visualRng"],
  "src/engine/gpu/Gfx.ts": ["WebGPU device, canvas context and canvas sizing.", "UnsupportedError Gfx showUnsupported"],
  "src/engine/gpu/Mesh.ts": ["GPU vertex/index buffers for one mesh, and the shared vertex layout.", "VERTEX_FLOATS VERTEX_STRIDE STATIC_VERTEX_LAYOUT nextMeshId Mesh createBufferWithData"],
  "src/engine/gpu/MeshBuilder.ts": ["Builds box-based meshes on the CPU (vertices, normals, colours).", "srgbHex BOX_FACES CORNER_SIGNS MeshBuilder"],
  "src/engine/render/Renderer.ts": ["The frame renderer: batches draw requests and runs all render passes.", "HDR_FORMAT DEPTH_FORMAT SHADOW_SIZE FRAME_FLOATS FX_FRAME_FLOATS POST_FLOATS INSTANCE_FLOATS SEGMENT_FLOATS MAX_INSTANCES MAX_SEGMENTS BLOOM_LEVELS LAYERS defaultPostParams Renderer WHITE"],
  "src/engine/render/Camera.ts": ["Perspective camera: view/projection matrices from position, yaw and pitch.", "MAX_PITCH Camera"],
  "src/engine/input/Input.ts": ["Keyboard, mouse, pointer lock and gamepad, mapped to named actions.", "DEFAULT_BINDINGS GAMEPAD_DEADZONE GAMEPAD_LOOK_SPEED GAMEPAD_BUTTONS Input"],
  "src/engine/loop/Loop.ts": ["Main loop: real time, scaled simulation time and the fixed 1/120 s step.", "FIXED_STEP MAX_REAL_DT MAX_STEPS_PER_FRAME Time Loop"],
  "src/engine/audio/AudioEngine.ts": ["WebAudio output: positional sound effects and the time-scale-filtered music.", "AudioEngine"],
  "src/engine/audio/synth.ts": ["Procedural sound synthesis (all sound effects are generated, no audio files).", "make noise lowpass highpass normalizeBuf mix gunshot SYNTHS"],
  "src/game/Game.ts": ["Top-level game object: owns every subsystem, game states, frame update and drawing.", "BASE_SENSITIVITY ENEMY_TINT ENEMY_EMISSIVE SHOT_SFX Game IDENTITY WHITE3 CORE TRAIL_PLAYER TRAIL_ENEMY"],
  "src/game/TimeScaleDriver.ts": ["The core mechanic: how fast time runs, derived from what the player is doing.", "TimeScaleDriver"],
  "src/game/player/PlayerController.ts": ["First-person movement and mouse look (runs in real time).", "WALK_SPEED ACCEL AIR_ACCEL GRAVITY3 JUMP_VELOCITY MAX_PITCH2 STEP_HEIGHT PlayerController"],
  "src/game/player/Viewmodel.ts": ["The player's hands and held item drawn in front of the camera.", "GLOVE2 Viewmodel"],
  "src/game/world/constants.ts": ["Player-related tuning constants used by the simulation.", "EYE_HEIGHT PLAYER_RADIUS PLAYER_HEIGHT PLAYER_BODY_A PLAYER_BODY_B PLAYER_BODY_R REACH PROP_PHYS_RADIUS GRAVITY2 THROW_SPEED PUNCH_COOLDOWN PUNCH_RANGE SLASH_RANGE SHOT_HEARING REST_ROT"],
  "src/game/world/World.ts": ["The simulation: player actions, props, projectiles, waves, win/lose. Emits events, never draws.", "World removeDead"],
  "src/game/world/items.ts": ["Weapons and throwable items: stats, names and sizes.", "BULLET_SPEED BULLET_RADIUS BULLET_LIFE WEAPONS isWeapon isGun newItem ITEM_NAMES ITEM_RADIUS FRAGILE"],
  "src/game/world/enemy.ts": ["Enemy types and their AI state machine.", "ENEMY_PARAMS ENEMY_RADIUS ENEMY_HEIGHT HEAD_OFFSET HEAD_RADIUS BODY_A BODY_B BODY_RADIUS SPAWN_TIME MELEE_TIME MELEE_STRIKE_AT MELEE_RANGE TELEGRAPH MARKSMAN_COOLDOWN GRAVITY MUZZLE_LOCAL createEnemy enemyIsTwoHanded enemyMuzzle scratchA scratchB scratchC savePrev updateEnemy setState applyGravityAndMove nextWaypoint handleShooting aimDirection fireVolley meleeStrike"],
  "src/game/world/StaticWorld.ts": ["Collision against the level's static boxes: raycasts, line of sight, character movement.", "CELL EPS StaticWorld cellKey clampN rayBox segmentSphere segmentCapsule"],
  "src/game/world/NavGrid.ts": ["Walkability grid and A* pathfinding for enemies.", "CELL2 AGENT_RADIUS STEP HEADROOM MAX_FLOOR NavGrid"],
  "src/game/replay/Replay.ts": ["Records the player's input per frame and replays it in a fresh World.", "ReplayRecorder ReplayPlayer"],
  "src/game/visuals/meshLibrary.ts": ["All non-level meshes: enemy body parts, items, hands, shards.", "PART_IDS PART_EXTENTS PART_CENTER WHITE2 OFFWHITE DARK GLASS GLOVE GLOVE_DARK buildMeshLibrary"],
  "src/game/visuals/pose.ts": ["Enemy skeleton pose: body-part matrices from animation parameters.", "createPose tmp computePose lerp2 easeOut"],
  "src/game/visuals/FxSystem.ts": ["Particles, sparks and glass shards.", "MAX_PARTICLES MAX_SHARDS SHARD_LIFE FxSystem randomUnit compact"],
  "src/game/levels/LevelBuilder.ts": ["Small language for building levels out of boxes (rooms, walls, pillars, crates).", "LevelBuilder level"],
  "src/game/levels/act1-transit.ts": ["Act 1 levels (1-1 to 1-5).", "platform car turnstiles escalator lastTrain ACT1"],
  "src/game/levels/act2-office.ts": ["Act 2 levels (2-1 to 2-5).", "lobby elevator cubicles serverRoom boardroom ACT2"],
  "src/game/levels/act3-rooftops.ts": ["Act 3 levels (3-1 to 3-5) and their shared rooftop helpers.", "roof acUnit skyline ledge skylight crane helipad spire ACT3"],
  "src/game/levels/index.ts": ["The ordered list of all levels.", "LEVELS ACT_NAMES"],
  "src/game/levels/themes.ts": ["Per-act colour palettes and lighting.", "m THEMES"],
  "src/game/levels/levelMesh.ts": ["Turns a level definition into its GPU mesh.", "buildLevelMesh buildLevelScene"],
  "src/ui/Ui.ts": ["All DOM UI: menus, settings, title cards, HUD.", "fmtTime Ui"],
  "src/ui/DebugOverlay.ts": ["The FPS / debug text overlay (F4).", "DebugOverlay"],
  "src/ui/save.ts": ["Settings and best times, stored in localStorage.", "KEY defaultSettings loadSave writeSave"],
};
const REASSIGNED = new Set(["nextMeshId"]); // top-level vars that are written after declaration

// ---------- read and chunk ----------
const lines = fs.readFileSync(SRC, "utf8").split("\n");
const shaderImports = new Map(); // fooWgsl -> path relative to src/
let i = 0;
for (; lines[i].startsWith("import ") || lines[i] === ""; i++) {
  const m = /^import (\w+Wgsl) from "\.\/(.+)";$/.exec(lines[i]);
  if (m) shaderImports.set(m[1], m[2]);
  else if (lines[i] && lines[i] !== 'import { mat4, vec3 } from "wgpu-matrix";') throw new Error("unexpected import: " + lines[i]);
}
const declRe = /^(?:async function|function|var|class) ([A-Za-z_$][\w$]*)/;
const chunks = [];
for (; i < lines.length; i++) {
  const m = declRe.exec(lines[i]);
  if (m) chunks.push({ name: m[1], lines: [lines[i]] });
  else if (chunks.length) chunks[chunks.length - 1].lines.push(lines[i]);
  else if (lines[i].trim()) throw new Error("code before first declaration: " + lines[i]);
}

const owner = new Map();
for (const [file, [, names]] of Object.entries(MODULES))
  for (const n of names.split(" ")) {
    if (owner.has(n)) throw new Error("assigned twice: " + n);
    owner.set(n, file);
  }
for (const c of chunks) if (!owner.has(c.name)) throw new Error("not assigned to a module: " + c.name);
for (const n of owner.keys()) if (!chunks.some((c) => c.name === n)) throw new Error("no such declaration: " + n);

// identifiers, skipping property accesses (`.foo`) but not spreads (`...foo`)
const identRe = /(?<![\w$])(?<!(?<!\.)\.)[A-Za-z_$][\w$]*/g;
const uses = (code) => new Set(code.match(identRe));

// which names does each module need from elsewhere?
const modules = new Map(Object.keys(MODULES).map((f) => [f, []]));
for (const c of chunks) {
  while (c.lines.length && c.lines[c.lines.length - 1].trim() === "") c.lines.pop();
  modules.get(owner.get(c.name)).push(c);
}
const needs = new Map();
const exported = new Set();
for (const [file, cs] of modules) {
  const used = uses(cs.map((c) => c.lines.join("\n")).join("\n"));
  needs.set(file, used);
  for (const id of used) if (owner.has(id) && owner.get(id) !== file) exported.add(id);
}

// ---------- emit ----------
const rel = (from, to) => {
  let r = path.posix.relative(path.posix.dirname(from), to).replace(/\.ts$/, "");
  return r.startsWith(".") ? r : "./" + r;
};
for (const [file, cs] of modules) {
  const body = cs.map((c) => {
    let text = c.lines.join("\n");
    const exp = exported.has(c.name) ? "export " : "";
    let m;
    if ((m = /^var (\w+) = class (_\w+) \{/.exec(text))) {
      // `var Foo = class _Foo {` (bundler output) -> `class Foo {`
      text = text.replace(m[0], `${exp}class ${m[1]} {`).replace(new RegExp(`\\b${m[2]}\\b`, "g"), m[1]);
      text = text.replace(/\n\};$/, "\n}");
    } else if ((m = /^var (\w+) = class (extends [\w.]+ )?\{/.exec(text))) {
      text = text.replace(m[0], `${exp}class ${m[1]} ${m[2] ?? ""}{`).replace(/\};$/, "}");
    } else if (text.startsWith("var ")) {
      text = exp + (REASSIGNED.has(c.name) ? "let " : "const ") + text.slice(4);
    } else {
      text = exp + text;
    }
    return text;
  });
  const used = needs.get(file);
  const imports = [];
  const wm = ["mat4", "vec3"].filter((n) => used.has(n));
  if (wm.length) imports.push(`import { ${wm.join(", ")} } from "wgpu-matrix";`);
  const byFile = new Map();
  for (const id of used) {
    const f = owner.get(id);
    if (!f || f === file) continue;
    byFile.set(f, [...(byFile.get(f) ?? []), id]);
  }
  for (const [f, ids] of [...byFile].sort((a, b) => a[0].localeCompare(b[0])))
    imports.push(`import { ${ids.sort().join(", ")} } from "${rel(file, f)}";`);
  for (const [name, p] of shaderImports)
    if (used.has(name)) imports.push(`import ${name} from "${rel(file, "src/" + p)}";`);
  const header = `// ${MODULES[file][0]}\n` + (imports.length ? imports.join("\n") + "\n" : "") + "\n";
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), header + body.join("\n\n") + "\n");
}
fs.rmSync(SRC);
const html = path.join(root, "index.html");
fs.writeFileSync(html, fs.readFileSync(html, "utf8").replace('src="/src/main.js"', 'src="/src/main.ts"'));

// ---------- drop false-positive imports (names that were only object keys) ----------
let out = "";
try {
  execFileSync("npx", ["tsc", "--noEmit", "--noUnusedLocals", "--pretty", "false"], { cwd: root, encoding: "utf8", shell: true });
} catch (e) {
  out = e.stdout;
}
const unused = new Map(); // file -> Set(names) on import lines
for (const l of out.split(/\r?\n/)) {
  const m = /^(.+?)\((\d+),\d+\): error TS6133: '(\w+)'/.exec(l);
  if (!m) continue;
  const file = path.join(root, m[1]);
  const fileLines = fs.readFileSync(file, "utf8").split("\n");
  if (!fileLines[Number(m[2]) - 1].startsWith("import ")) continue; // a real unused declaration: leave it
  if (!unused.has(file)) unused.set(file, new Set());
  unused.get(file).add(m[3]);
}
let dropped = 0;
for (const [file, names] of unused) {
  const text = fs.readFileSync(file, "utf8").split("\n").map((l) => {
    const m = /^import \{ (.+) \} from (".+");$/.exec(l);
    if (!m) return l;
    const keep = m[1].split(", ").filter((n) => !names.has(n));
    dropped += m[1].split(", ").length - keep.length;
    return keep.length ? `import { ${keep.join(", ")} } from ${m[2]};` : null;
  }).filter((l) => l !== null).join("\n");
  fs.writeFileSync(file, text);
}
// a name nobody imports any more doesn't need `export`
const stillImported = new Set();
for (const file of modules.keys())
  for (const m of fs.readFileSync(path.join(root, file), "utf8").matchAll(/^import \{ (.+) \} from "\./gm))
    m[1].split(", ").forEach((n) => stillImported.add(n));
let unexported = 0;
for (const file of modules.keys()) {
  const p = path.join(root, file);
  const text = fs.readFileSync(p, "utf8").replace(/^export ((?:const|let|function|class) (\w+))/gm, (all, decl, name) => {
    if (stillImported.has(name)) return all;
    unexported++;
    return decl;
  });
  fs.writeFileSync(p, text);
}
console.log(`${chunks.length} declarations -> ${modules.size} modules; dropped ${dropped} false-positive imports, ${unexported} unneeded exports`);

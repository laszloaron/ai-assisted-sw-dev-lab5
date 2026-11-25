// Equivalence check: does the current production build behave exactly like the
// original single-file game (git tag `baseline`)?
//
// Both are run headless through the same scripted sessions (scenarios.mjs) in a
// recording fake browser (env.mjs). For every frame we hash everything the game
// did: all WebGPU calls with buffer contents and shader source, all WebAudio
// calls, console warnings, the whole DOM and the save data. Any difference is
// reported with the first frame where it appears.
//
// Usage: npm run check:equivalence      (builds first)
//        node tools/equivalence/check.mjs --no-build
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const cache = path.join(here, ".cache");
fs.mkdirSync(cache, { recursive: true });

const CDN_URL = "https://cdn.jsdelivr.net/npm/wgpu-matrix@3.4.2/dist/3.x/wgpu-matrix.module.min.js";
const cdnCopy = path.join(cache, "wgpu-matrix-3.4.2.module.min.js");
if (!fs.existsSync(cdnCopy)) {
  const res = await fetch(CDN_URL);
  if (!res.ok) throw new Error(`could not download ${CDN_URL}: ${res.status}`);
  fs.writeFileSync(cdnCopy, Buffer.from(await res.arrayBuffer()));
}
// Node can't import from https: point CDN imports at a local copy of that same file
const localiseCdn = (code) => code.split(CDN_URL).join("./" + path.basename(cdnCopy));

// ---- baseline: the original file from the git tag ----
const baselineHtml = execFileSync("git", ["show", "baseline:index.html"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
const m = /<script type="module">\n([\s\S]*?)<\/script>/.exec(baselineHtml);
if (!m) throw new Error("no inline module script in baseline");
fs.writeFileSync(path.join(cache, "baseline.html"), baselineHtml);
fs.writeFileSync(path.join(cache, "baseline.mjs"), localiseCdn(m[1]));

// ---- candidate: the production build ----
if (!process.argv.includes("--no-build")) execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", shell: true });
const dist = path.join(root, "dist");
const distHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const entry = /<script type="module" crossorigin src="\/?([^"]+)"/.exec(distHtml)?.[1];
if (!entry) throw new Error("no entry script in dist/index.html");
fs.writeFileSync(path.join(cache, "candidate.html"), distHtml);
fs.writeFileSync(path.join(cache, "candidate.mjs"), localiseCdn(fs.readFileSync(path.join(dist, entry), "utf8")));

const run = (which, scenario, dump) =>
  new Promise((resolve, reject) => {
    const args = [path.join(here, "run.mjs"), path.join(cache, `${which}.html`), path.join(cache, `${which}.mjs`), scenario];
    if (dump !== undefined) args.push(String(dump));
    execFile(process.execPath, args, { maxBuffer: 1 << 28 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${which}/${scenario} failed:\n${stderr.slice(-3000)}`)) : resolve(stdout));
  });

let failed = false;

// ---- static checks: the page skeleton and stylesheet (jsdom doesn't render CSS) ----
const baselineCss = /<style>\n([\s\S]*?)<\/style>/.exec(baselineHtml)[1];
const sourceCss = fs.readFileSync(path.join(root, "src/styles/main.css"), "utf8");
if (sourceCss === baselineCss) console.log("✔ stylesheet: src/styles/main.css is byte-identical to the original <style>");
else { failed = true; console.log("✘ stylesheet: src/styles/main.css differs from the original <style>"); }
const headOf = (html) => /<head>([\s\S]*?)<\/head>/.exec(html)[1].replace(/<style>[\s\S]*<\/style>|<link rel="stylesheet"[^>]*>|<script[^>]*><\/script>|<link rel="modulepreload"[^>]*>/g, "").replace(/\s+/g, " ").trim();
const sourceHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (headOf(sourceHtml) === headOf(baselineHtml)) console.log("✔ <head>: same title, meta tags and icon");
else { failed = true; console.log(`✘ <head> differs:\n  baseline : ${headOf(baselineHtml)}\n  candidate: ${headOf(sourceHtml)}`); }

for (const scenario of Object.keys(SCENARIOS)) {
  const [a, b] = await Promise.all([run("baseline", scenario), run("candidate", scenario)]);
  const ha = JSON.parse(a.trim().split("\n").pop());
  const hb = JSON.parse(b.trim().split("\n").pop());
  const n = Math.max(ha.length, hb.length);
  let first = -1;
  for (let i = 0; i < n; i++) if (ha[i] !== hb[i]) { first = i; break; }
  const records = ha.reduce((s, h) => s + Number(h.split(" ")[1]), 0);
  if (first < 0) {
    console.log(`✔ ${scenario}: ${ha.length} frames identical (${records} recorded calls compared)`);
    continue;
  }
  failed = true;
  const frame = first - 1; // index 0 is the boot phase
  console.log(`✘ ${scenario}: first difference at frame ${frame}`);
  const [da, db] = await Promise.all([run("baseline", scenario, frame), run("candidate", scenario, frame)]);
  const la = da.split("\n"), lb = db.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      console.log(`  line ${i}:\n  baseline : ${la[i]?.slice(0, 400)}\n  candidate: ${lb[i]?.slice(0, 400)}`);
      break;
    }
  }
}
process.exit(failed ? 1 : 0);

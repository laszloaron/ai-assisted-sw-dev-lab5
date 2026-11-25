// Runs one build of the game through one scenario and prints a hash per frame.
// Usage: node run.mjs <page.html> <entry.mjs> <scenario> [dumpFrame]
// With dumpFrame, prints the full recorded log of that frame instead.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { installEnvironment } from "./env.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const [, , htmlPath, entryPath, scenarioName, dumpArg] = process.argv;
const scenario = SCENARIOS[scenarioName]();
const env = installEnvironment({ html: fs.readFileSync(htmlPath, "utf8"), storage: scenario.storage });
const out = process.stdout;

const byFrame = new Map();
for (const [f, fn] of scenario.actions) {
  if (!byFrame.has(f)) byFrame.set(f, []);
  byFrame.get(f).push(fn);
}

await import(pathToFileURL(entryPath).href);
await env.waitForFirstFrame();
const statsMode = dumpArg === "--stats";
const dumpFrame = dumpArg === undefined || statsMode ? null : Number(dumpArg);
const hashes = [];
const stats = new Map();
const countCalls = (lines) => {
  for (const l of lines) {
    const key = l.replace(/#\d+/g, "").replace(/\(.*$/s, "()").replace(/ = .*$/s, " =").slice(0, 80);
    stats.set(key, (stats.get(key) ?? 0) + 1);
  }
};
// frame -1 = everything that happened during boot
const emit = (frame) => {
  const lines = env.log.splice(0);
  if (statsMode) countCalls(lines);
  // body elements only: the whitespace text nodes directly under <body> differ
  // just because the <script> tag moved; everything inside elements counts
  const elements = [...env.document.body.children].map((el) => el.outerHTML).join("\n");
  const dom = elements + "\n" + env.window.localStorage.getItem("stillframe.save");
  if (frame === dumpFrame) {
    out.write(lines.join("\n") + "\n--- DOM ---\n" + dom + "\n");
    process.exit(0);
  }
  hashes.push(createHash("sha1").update(lines.join("\n")).update("\0").update(dom).digest("hex").slice(0, 16) + ` ${lines.length}`);
};
emit(-1);
for (let frame = 0; frame < scenario.frames; frame++) {
  for (const fn of byFrame.get(frame) ?? []) fn(env);
  // slightly uneven frame times, like a real display
  await env.tick(frame % 7 === 3 ? 18.1 : 16.6);
  emit(frame);
}
if (statsMode) {
  for (const [k, n] of [...stats].sort((a, b) => b[1] - a[1])) out.write(`${String(n).padStart(9)}  ${k}\n`);
}
out.write(JSON.stringify(hashes) + "\n");
process.exit(0);

// Runs every reproduction script in repro/ and summarises PASS/FAIL.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "repro");
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort()) {
  try {
    process.stdout.write(execFileSync(process.execPath, [path.join(dir, f)], { encoding: "utf8" }).trim().split("\n").pop() + "\n");
  } catch (e) {
    failed++;
    process.stdout.write((e.stdout || "").trim().split("\n").pop() + "\n" || `FAIL ${f} (crashed)\n`);
  }
}
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
// Pulls the latest changes from the upstream Microsoft repo into the current branch.
// Usage: node scripts/sync-upstream.mjs
import { execSync } from "node:child_process";

const UPSTREAM = "https://github.com/microsoft/msfs-avionics-mirror.git";
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

try {
  execSync("git remote get-url upstream", { stdio: "ignore" });
} catch {
  run(`git remote add upstream ${UPSTREAM}`);
}

run("git fetch upstream --tags --prune");
run("git merge upstream/main");
console.log("\nDone. Push when ready: git push");

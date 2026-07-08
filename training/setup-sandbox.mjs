#!/usr/bin/env node
/**
 * Build the disposable training sandbox as its OWN git repo from training/sandbox-seed/.
 * The sandbox (training/.sandbox) is gitignored by uphub-agents — only the SEED is tracked, so the
 * fixture is reproducible on any machine with one command and no npm install.
 *
 *   node training/setup-sandbox.mjs            # create if missing
 *   node training/setup-sandbox.mjs --force    # wipe and rebuild
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(ROOT, "training", "sandbox-seed");
const SANDBOX = join(ROOT, "training", ".sandbox");
const force = process.argv.includes("--force");
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8" });

if (existsSync(join(SANDBOX, ".git")) && !force) {
    console.log(`sandbox already set up at ${SANDBOX} (use --force to rebuild)`);
    process.exit(0);
}
if (force && existsSync(SANDBOX)) rmSync(SANDBOX, { recursive: true, force: true });

cpSync(SEED, SANDBOX, { recursive: true });
sh("git init -b main", SANDBOX);
// Local identity so commits work even if git has no global user configured.
sh('git config user.email "training-bot@uphub.local"', SANDBOX);
sh('git config user.name "uphub training bot"', SANDBOX);
sh("git add -A", SANDBOX);
sh('git commit -m "chore: training sandbox baseline (clean — all tests pass)"', SANDBOX);

// Task-specific base branch for T1: a committed state where subtract is broken. T1 branches off
// THIS, so its `node --test` starts red and the agent's job is to make it green. main stays clean,
// so T2 (add a feature) and T3 (nothing-to-do) start from a green baseline and aren't dragged red
// by an unrelated pre-existing bug.
sh("git checkout -b bug-subtract", SANDBOX);
const mathPath = join(SANDBOX, "src", "mathUtils.mjs");
writeFileSync(mathPath, readFileSync(mathPath, "utf8").replace("return a - b;", "return a + b;"));
sh("git add src/mathUtils.mjs", SANDBOX);
sh('git commit -m "chore: seed subtract bug for task T1 (do not fix on main)"', SANDBOX);
sh("git checkout main", SANDBOX);

console.log(`✓ sandbox ready at ${SANDBOX}`);
console.log("  main         — clean baseline, `node --test` GREEN (base for T2 feature + T3 negative-control)");
console.log("  bug-subtract — subtract broken, `node --test` RED (base for T1 bug-fix)");
console.log("  next: node training/run-training.mjs --all");

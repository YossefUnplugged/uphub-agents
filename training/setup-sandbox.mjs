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
import { cpSync, existsSync, rmSync } from "node:fs";
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
sh('git commit -m "chore: training sandbox baseline (deliberate subtract bug)"', SANDBOX);

console.log(`✓ sandbox ready at ${SANDBOX} (branch main, baseline committed)`);
console.log("  baseline is INTENTIONALLY failing `node --test` (subtract bug) — that is task T1's target.");
console.log("  next: node training/run-training.mjs --task T1-fix-subtract");

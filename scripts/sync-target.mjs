#!/usr/bin/env node
/**
 * sync-target — stamp the agent-system's context into a target repo's local .claude/.
 *
 * Source of truth = this repo. Destination = <target>/.claude/ (gitignored, local).
 * Idempotent push. Mirrors skills/, copies routing + hook, owns the `hooks` key in
 * .claude/settings.json (managed), tracks everything in .agent-sync-manifest.json so
 * removing a skill here removes it there on the next sync.
 *
 * NEVER touches <target>/.claude/settings.local.json (human-owned permissions).
 *
 * Usage: node scripts/sync-target.mjs --target admin [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targetName = args[args.indexOf("--target") + 1] || "admin";
const dryRun = args.includes("--dry-run");

const config = JSON.parse(readFileSync(join(REPO_ROOT, "config", "targets.json"), "utf8"));
const target = config.targets?.[targetName];
if (!target) { console.error(`Unknown target "${targetName}"`); process.exit(2); }

const DEST = join(target.path, ".claude");
const written = [];
const log = (m) => console.log(`  ${dryRun ? "[dry] " : ""}${m}`);

function ensureDir(d) { if (!dryRun) mkdirSync(d, { recursive: true }); }
function write(absPath, content) {
    ensureDir(dirname(absPath));
    if (!dryRun) writeFileSync(absPath, content);
    written.push(relative(target.path, absPath).replace(/\\/g, "/"));
    log(`write ${relative(target.path, absPath).replace(/\\/g, "/")}`);
}
function copy(src, dst) {
    ensureDir(dirname(dst));
    if (!dryRun) copyFileSync(src, dst);
    written.push(relative(target.path, dst).replace(/\\/g, "/"));
    log(`copy  ${relative(target.path, dst).replace(/\\/g, "/")}`);
}
/** relative paths of every file under dir (recursive) */
function filesUnder(dir, root = dir, acc = []) {
    for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) filesUnder(full, root, acc);
        else acc.push(relative(root, full));
    }
    return acc;
}

console.log(`\nsync-target → ${target.displayName}  (${DEST})\n`);

/* ---- 0. freshness gate — never stamp a skill that points at a file that does not exist ---- */
if (!args.includes("--force")) {
    try {
        execSync(`node "${join(REPO_ROOT, "scripts", "check-skill-freshness.mjs")}" --target ${targetName}`,
            { stdio: "pipe", encoding: "utf8" });
    } catch (e) {
        console.error((e.stdout || "") + (e.stderr || ""));
        console.error("  ✗ sync aborted: fix the broken skill link(s) above, or re-run with --force to sync anyway.\n");
        process.exit(1);
    }
}

/* ---- 1. skills mirror ---- */
const srcSkills = join(REPO_ROOT, "skills");
const destSkills = join(DEST, "skills");
const metaSkills = new Set(config.metaSkills || []);   // repo-maintenance skills — never synced to a target
const skillNames = existsSync(srcSkills)
    ? readdirSync(srcSkills).filter(n => statSync(join(srcSkills, n)).isDirectory() && !metaSkills.has(n))
    : [];

// load prior manifest to detect removed skills
const manifestPath = join(DEST, ".agent-sync-manifest.json");
let prior = { written: [] };
if (existsSync(manifestPath)) { try { prior = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* ignore */ } }

for (const name of skillNames) {
    const srcDir = join(srcSkills, name);
    // Mirror the WHOLE skill dir — SKILL.md AND its supporting files (recipes, references, images).
    // Copying only SKILL.md silently breaks in-skill links like admin-design → component-recipes.md.
    for (const rel of filesUnder(srcDir)) {
        copy(join(srcDir, rel), join(destSkills, name, rel));
    }
}

/* ---- 2. routing table + hook ---- */
copy(join(REPO_ROOT, "rules", "routing.json"), join(DEST, "context", "routing.json"));
copy(join(REPO_ROOT, "hooks", "route-on-touch.mjs"), join(DEST, "hooks", "route-on-touch.mjs"));

/* ---- 3. settings.json — own the `hooks` key, preserve everything else; never touch settings.local.json ---- */
const settingsPath = join(DEST, "settings.json");
let settings = {};
if (existsSync(settingsPath)) { try { settings = JSON.parse(readFileSync(settingsPath, "utf8")); } catch { /* ignore */ } }
const hookCmd = `node "${join(DEST, "hooks", "route-on-touch.mjs").replace(/\\/g, "/")}"`;
settings.hooks = {
    PreToolUse: [
        { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: hookCmd, timeout: 15 }] }
    ]
};
settings["//agent-managed"] = "The `hooks` key is managed by unplugged-agent-system sync-target. Edit permissions in settings.local.json, not here.";
write(settingsPath, JSON.stringify(settings, null, 2) + "\n");

/* ---- 4. clean up skills removed from source since last sync ---- */
const priorSkillFiles = (prior.written || []).filter(p => /^\.claude\/skills\//.test(p));
const currentSet = new Set(written.map(p => ".claude/" + p.replace(/^\.claude\//, "")).map(p => p));
for (const old of priorSkillFiles) {
    const stillThere = written.some(w => (".claude/" + w.replace(/^\.claude\//, "")) === old || w === old.replace(/^\.claude\//, ""));
    if (!stillThere) {
        const abs = join(target.path, old);
        if (existsSync(abs)) { if (!dryRun) rmSync(dirname(abs), { recursive: true, force: true }); log(`remove ${old} (no longer in source)`); }
    }
}

/* ---- 5. manifest ---- */
const manifest = {
    target: targetName,
    syncedAt: new Date().toISOString(),
    sourceRoot: REPO_ROOT.replace(/\\/g, "/"),
    skills: skillNames,
    written
};
if (!dryRun) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n  ${written.length} files ${dryRun ? "would be written" : "written"} · ${skillNames.length} skills · settings.local.json untouched\n`);

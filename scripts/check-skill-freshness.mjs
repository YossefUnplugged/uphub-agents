#!/usr/bin/env node
/**
 * Skill-freshness gate — catch skills that have rotted away from reality.
 *
 * A skill is only as trustworthy as its references. Two failure modes rot silently:
 *   1. a markdown link to a supporting doc that was never written (or was deleted), and
 *   2. a claim that a repo path exists (`apps/...`, `libs/...`) after that path moved.
 * Both leave the agent following a dead pointer. This script reads every skill markdown file,
 * resolves those two kinds of reference against the filesystem, and reports the broken ones.
 *
 * It is deliberately CONSERVATIVE — it only flags references it can resolve unambiguously, so a
 * clean run means something. It does NOT judge prose drift (that needs a human / the real tree).
 *
 *   node scripts/check-skill-freshness.mjs                 # scan skills/ against the admin target
 *   node scripts/check-skill-freshness.mjs --target admin --json
 *
 * Exit: 0 = no broken LOCAL links (repo-path misses are warnings). 1 = at least one broken link.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const getFlag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const targetName = getFlag("--target") || "admin";
const json = argv.includes("--json");

const config = JSON.parse(readFileSync(join(REPO_ROOT, "config", "targets.json"), "utf8"));
const target = config.targets?.[targetName];
if (!target) { console.error(`Unknown target "${targetName}"`); process.exit(2); }
const TARGET_PATH = target.path;

const SKILLS_DIR = join(REPO_ROOT, "skills");

/** every *.md file under skills/ */
function mdFiles(dir, acc = []) {
    for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) mdFiles(full, acc);
        else if (e.endsWith(".md")) acc.push(full);
    }
    return acc;
}

const findings = [];   // { file, kind: "link"|"repo-path", ref, level: "fail"|"warn" }

for (const file of mdFiles(SKILLS_DIR)) {
    const text = readFileSync(file, "utf8");
    const here = dirname(file);
    const rel = file.replace(REPO_ROOT, "").replace(/\\/g, "/").replace(/^\//, "");

    // (1) markdown links [text](target) — local files only (skip URLs, anchors, mailto).
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
        let tgt = m[1].trim();
        if (/^(https?:|mailto:|#)/.test(tgt)) continue;   // external / in-page anchor
        tgt = tgt.split("#")[0].trim();                   // strip #anchor on a file link
        if (!tgt) continue;
        // only treat things that look like a file path we can resolve (has an extension)
        if (!/\.[a-z0-9]+$/i.test(tgt)) continue;
        const abs = resolve(here, tgt);
        if (!existsSync(abs)) findings.push({ file: rel, kind: "link", ref: tgt, level: "fail" });
    }

    // (2) repo-path claims apps/… libs/… — resolved against the TARGET repo. WARN (may be a glob).
    for (const m of text.matchAll(/\b(apps|libs)\/[A-Za-z0-9_./-]+/g)) {
        let p = m[0].replace(/[.,;:)]+$/, "");            // trailing punctuation
        if (/[*{}]/.test(p) || p.endsWith("/")) continue; // globs / bare dir prefixes: skip (FP-prone)
        const abs = join(TARGET_PATH, p);
        if (!existsSync(abs)) findings.push({ file: rel, kind: "repo-path", ref: p, level: "warn" });
    }
}

const fails = findings.filter(f => f.level === "fail");
const warns = findings.filter(f => f.level === "warn");

if (json) {
    console.log(JSON.stringify({ target: targetName, ok: fails.length === 0, findings }, null, 2));
} else {
    console.log(`\nSkill-freshness gate  ·  target: ${target.displayName || targetName}\n`);
    if (!findings.length) console.log("  ✓ every skill link and repo-path reference resolves.\n");
    for (const f of fails) console.log(`  [BROKEN LINK] ${f.file}\n      -> ${f.ref} (no such file)`);
    for (const w of warns) console.log(`  [stale path?] ${w.file}\n      -> ${w.ref} (not found in ${targetName}; verify or fix)`);
    if (findings.length) console.log(`\n  ${fails.length} broken link(s) · ${warns.length} path warning(s)\n`);
    console.log(fails.length === 0 ? "  ✓ freshness gate PASSED\n" : "  ✗ freshness gate FAILED — a skill points at a file that does not exist.\n");
}

process.exit(fails.length === 0 ? 0 : 1);

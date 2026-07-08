#!/usr/bin/env node
/**
 * Gate A — the deterministic compliance validator.
 *
 * An agent judging its own compliance is a conflict of interest; an exit code is not.
 * This script runs a fixed battery of checks against a target repo and exits 0 (all pass)
 * or 1 (any hard failure). Warnings (e.g. omission rules) never fail the build — they are
 * surfaced for the human reviewer, exactly as the design's PR body would carry them.
 *
 * Usage:
 *   node scripts/validate.mjs --target admin [--base origin/main]
 *   node scripts/validate.mjs --target admin --only branch,commit,imports   # cheap subset, fast
 *   node scripts/validate.mjs --target admin --skip test,lint --json
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

/* ---------- args ---------- */
function parseArgs(argv) {
    const args = { target: "admin", base: "origin/main", only: null, skip: [], json: false, path: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--target") args.target = argv[++i];
        else if (a === "--base") args.base = argv[++i];
        else if (a === "--only") args.only = argv[++i].split(",").map(s => s.trim());
        else if (a === "--skip") args.skip = argv[++i].split(",").map(s => s.trim());
        else if (a === "--json") args.json = true;
        else if (a === "--path") args.path = argv[++i];   // override the target's repo path (e.g. a worktree)
    }
    return args;
}
const args = parseArgs(process.argv.slice(2));

/* ---------- config ---------- */
const config = JSON.parse(readFileSync(join(REPO_ROOT, "config", "targets.json"), "utf8"));
const target = config.targets?.[args.target];
if (!target) {
    console.error(`Unknown target "${args.target}". Known: ${Object.keys(config.targets || {}).join(", ")}`);
    process.exit(2);
}
const TARGET_PATH = args.path || target.path;

/* ---------- helpers ---------- */
const results = [];
function record(name, status, detail) {
    results.push({ name, status, detail });
}
function wanted(name) {
    if (args.only) return args.only.includes(name);
    return !args.skip.includes(name);
}
function git(cmd) {
    return execSync(`git ${cmd}`, { cwd: TARGET_PATH, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function listFiles(dir, fileRe, acc = []) {
    let entries;
    try { entries = readdirSync(dir); } catch { return acc; }
    for (const e of entries) {
        if (e === "node_modules" || e === ".git" || e === "dist") continue;
        const full = join(dir, e);
        const st = statSync(full);
        if (st.isDirectory()) listFiles(full, fileRe, acc);
        else if (fileRe.test(e)) acc.push(full);
    }
    return acc;
}

/* ---------- checks ---------- */

// branch name
if (wanted("branch")) {
    try {
        const branch = git("rev-parse --abbrev-ref HEAD");
        const re = new RegExp(target.conventions.branchPattern);
        re.test(branch)
            ? record("branch", "pass", `branch "${branch}" matches ${target.conventions.branchPattern}`)
            : record("branch", "fail", `branch "${branch}" does NOT match ${target.conventions.branchPattern}`);
    } catch (e) { record("branch", "fail", `could not read branch: ${e.message}`); }
}

// last commit message: subject + Refs trailer
if (wanted("commit")) {
    try {
        const msg = git("log -1 --pretty=%B");
        const subject = msg.split("\n")[0];
        const subjectRe = new RegExp(target.conventions.commitSubjectPattern);
        const ticketRe = new RegExp(target.conventions.commitTicketPattern);
        const okSubject = subjectRe.test(subject);
        const okTicket = ticketRe.test(msg);
        if (okSubject && okTicket) record("commit", "pass", `conventional subject + ticket ref present ("${subject}")`);
        else record("commit", "fail",
            `${okSubject ? "" : `subject doesn't match ${target.conventions.commitSubjectPattern} . `}${okTicket ? "" : `message lacks a ticket ref matching ${target.conventions.commitTicketPattern} .`}`);
    } catch (e) { record("commit", "fail", `could not read commit: ${e.message}`); }
}

// forbidden imports
if (wanted("imports")) {
    // Diff-scope: judge what the change INTRODUCED, not pre-existing repo debt — otherwise one old
    // violation on main blocks every per-ticket run. When a base...HEAD diff exists we check only the
    // changed files; with no diff (HEAD==base / a whole-repo audit) we fall back to scanning the tree.
    let changedSet = null;
    try {
        const changed = git(`diff --name-only ${args.base}...HEAD`).split("\n").filter(Boolean);
        if (changed.length) changedSet = new Set(changed.map(f => f.replace(/\\/g, "/")));
    } catch { /* base ref not available locally → tree-wide */ }
    // Normalize the target root to forward slashes ONCE — listFiles emits OS-separator (backslash on
    // Windows) paths while TARGET_PATH may be forward-slashed in config, so a literal replace misses.
    const normTarget = TARGET_PATH.replace(/\\/g, "/").replace(/\/$/, "");
    for (const rule of target.forbiddenImports || []) {
        const base = join(TARGET_PATH, rule.inPath);
        const fileRe = new RegExp(rule.filePattern);
        const matchRe = new RegExp(rule.matchPattern);
        const allowRe = rule.allowIfLineMatches ? new RegExp(rule.allowIfLineMatches) : null;
        const violations = [];
        for (const file of listFiles(base, fileRe)) {
            const relPath = file.replace(/\\/g, "/").slice(normTarget.length).replace(/^\//, "");
            if (changedSet && !changedSet.has(relPath)) continue;   // only judge files this change touched
            const lines = readFileSync(file, "utf8").split("\n");
            lines.forEach((line, i) => {
                if (matchRe.test(line) && !(allowRe && allowRe.test(line))) {
                    violations.push(`${relPath}:${i + 1}`);
                }
            });
        }
        const scope = changedSet ? "changed files" : "tree-wide";
        violations.length === 0
            ? record(`imports:${rule.name}`, "pass", `${rule.message} (${scope})`)
            : record(`imports:${rule.name}`, "fail", `${rule.message}\n      ${violations.join("\n      ")}`);
    }
}

// omission rules (WARN only — never fails the build)
if (wanted("omission")) {
    let changed = [];
    try {
        changed = git(`diff --name-only ${args.base}...HEAD`).split("\n").filter(Boolean);
    } catch { /* base ref may be missing locally; skip silently */ }
    if (changed.length) {
        for (const rule of target.omissionRules || []) {
            const touched = changed.some(f => f.startsWith(rule.ifTouched));
            if (!touched) continue;
            const alsoTouched = rule.expectAlsoTouched.some(p => changed.some(f => f.startsWith(p)));
            alsoTouched
                ? record(`omission:${rule.name}`, "pass", "expected companion change present")
                : record(`omission:${rule.name}`, "warn", rule.message);
        }
    }
}

// context-path guard: generated/context files must NEVER be committed.
// (nested CLAUDE.md is not gitignored, so this is the safety net — see standards/git.md)
// Checks the STAGED index AND the committed diff (base...HEAD): the agent commits before Gate A runs,
// so a "staged-only" check sees an empty index and skips — a committed .claude/ or CLAUDE.md would slip
// through. Both surfaces are inspected so the guard actually holds post-commit.
if (wanted("staged")) {
    const isForbidden = (f) => /(^|\/)\.claude\//.test(f) || /(^|\/)CLAUDE\.md$/.test(f) || /_inventory\.md$/.test(f);
    let staged = [], committed = [];
    try { staged = git("diff --cached --name-only").split("\n").filter(Boolean); } catch { /* no index / no repo */ }
    try { committed = git(`diff --name-only ${args.base}...HEAD`).split("\n").filter(Boolean); } catch { /* base ref missing locally */ }
    const forbidden = [...new Set([...staged, ...committed])].filter(isForbidden);
    if (!staged.length && !committed.length) {
        record("staged", "skip", "nothing staged or committed vs base");
    } else {
        forbidden.length === 0
            ? record("staged", "pass", "no agent-context files staged or committed")
            : record("staged", "fail", `agent-context files must not be committed (use explicit \`git add\`, never -A):\n      ${forbidden.join("\n      ")}`);
    }
}

// heavy checks: run the target's own commands
for (const key of ["lint", "typecheck", "test"]) {
    if (!wanted(key) || !target.checks?.[key]) continue;
    const cmd = target.checks[key].replace(/\$\{base\}/g, args.base);
    try {
        execSync(cmd, { cwd: TARGET_PATH, encoding: "utf8", stdio: "pipe" });
        record(key, "pass", cmd);
    } catch (e) {
        const out = (e.stdout || e.stderr || e.message || "").toString();
        const tail = out.split("\n").slice(-12).join("\n");
        // "Tool couldn't START" (repo toolchain not set up) vs "tool FOUND problems in the agent's code".
        // CRITICAL: "Cannot find module" is deliberately NOT here — that is TS2307 for a bad import in the
        // agent's OWN code (the single most common real defect); classifying it as tooling would let
        // broken, non-compiling code print "Gate A PASSED".
        const toolingBroken = /No ESLint configuration found|couldn't find a configuration file|ESLint couldn't find|was referenced from the config file|is not installed correctly|command not found|is not recognized as|Cannot find the binary|Failed to load (config|plugin)/i.test(out);
        // Backstop: if the tool emitted ANY real per-file diagnostic, it DID run — a failure is a failure,
        // never downgraded to a warning, even if a tooling phrase also appears in the output.
        const hasRealDiagnostics = /error TS\d+|\bTS\d{3,}\b|\d+\s+problems?\s*\(\d+\s+error|\bFAIL\b|✗|✘|Tests?\s+failed|failing/i.test(out);
        const treatAsWarn = toolingBroken && !hasRealDiagnostics;
        record(key, treatAsWarn ? "warn" : "fail",
            treatAsWarn
                ? `${cmd}\n      tooling could not START (not a code violation) — WARNING, not a Gate-A failure. Fix the target's ${key} setup separately:\n      ${tail}`
                : `${cmd}\n      ${tail}`);
    }
}

/* ---------- report ---------- */
const fails = results.filter(r => r.status === "fail");
const warns = results.filter(r => r.status === "warn");

if (args.json) {
    console.log(JSON.stringify({ target: args.target, ok: fails.length === 0, results }, null, 2));
} else {
    const icon = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "skip" };
    console.log(`\nGate A — compliance-validator  ·  target: ${target.displayName}\n`);
    for (const r of results) console.log(`  [${icon[r.status]}] ${r.name}\n      ${r.detail}`);
    console.log(`\n  ${results.filter(r => r.status === "pass").length} passed · ${fails.length} failed · ${warns.length} warnings\n`);
    console.log(fails.length === 0 ? "  ✓ Gate A PASSED\n" : "  ✗ Gate A FAILED — no PR.\n");
}

process.exit(fails.length === 0 ? 0 : 1);

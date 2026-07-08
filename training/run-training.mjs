#!/usr/bin/env node
/**
 * TRAINING TRACK — exercise the full local pipeline on a synthetic task, safely.
 *
 *   node training/run-training.mjs --task T1-fix-subtract       # one task
 *   node training/run-training.mjs --all                        # every task in training/tasks/
 *   node training/run-training.mjs --task T2-add-multiply --keep # leave the worktree for inspection
 *
 * Per task, in an ISOLATED git worktree of the sandbox (never a real repo, never the dev's checkout):
 *   1. worktree add off the baseline
 *   2. the AGENT implements + commits (and ONLY that — it does not run the gate or open a PR)
 *   3. the WRAPPER (this script) runs Gate A (validate.mjs) — the agent never grades itself
 *   4. a hidden acceptance test (if any) is dropped in and Gate A's test step runs it
 *   5. score PASS/FAIL, write a results ledger, tear the worktree down
 *
 * This is a training/exercise ground, not the historical-PR benchmark: throwaway tasks with known-good
 * outcomes, so we can iterate on skills/gates/prompts and watch the whole route run end to end.
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SANDBOX = join(ROOT, "training", ".sandbox");
const TASKS_DIR = join(ROOT, "training", "tasks");
const VALIDATE = join(ROOT, "scripts", "validate.mjs");

const argv = process.argv.slice(2);
const getFlag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const only = getFlag("--task");
const all = argv.includes("--all");
const keep = argv.includes("--keep");
const base = getFlag("--base") || "main";
const maxTurns = getFlag("--max-turns") || "40";

function sh(cmd, cwd, opts = {}) {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}
function shSafe(cmd, cwd) { try { return sh(cmd, cwd); } catch { return null; } }

if (!existsSync(join(SANDBOX, ".git"))) {
    console.error("Sandbox not set up. Run: node training/setup-sandbox.mjs");
    process.exit(2);
}

const tasks = readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(TASKS_DIR, f), "utf8")))
    .filter((t) => all || !only || t.id === only);

if (!tasks.length) { console.error(`No tasks matched (${only || "all"}).`); process.exit(2); }

// results/<stamp>/ — Date is fine here (this is a normal node script, not a workflow script).
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(ROOT, "training", "results", stamp);
mkdirSync(outDir, { recursive: true });

function runTask(task) {
    const branch = task.branch;
    const wt = join(ROOT, "training", ".worktrees", branch);
    console.log(`\n── ${task.id}  (${task.kind})`);

    shSafe(`git worktree remove --force "${wt}"`, SANDBOX);
    shSafe(`git branch -D ${branch}`, SANDBOX);
    sh(`git worktree add "${wt}" -b ${branch} ${base}`, SANDBOX);

    // Give the worktree just enough permission for a headless run (untracked, never committed).
    mkdirSync(join(wt, ".claude"), { recursive: true });
    writeFileSync(
        join(wt, ".claude", "settings.local.json"),
        JSON.stringify({ permissions: { allow: ["Bash(git *)", "Bash(node *)", "Edit", "Write", "Read", "Grep", "Glob"] } }, null, 2)
    );

    const prompt =
        `You are on git branch "${branch}" in a small dependency-free Node.js project. Implement this task and NOTHING else:\n\n` +
        `${task.prompt}\n\n` +
        `When done: stage ONLY the files you changed (git add <files>, never -A) and make ONE commit with subject ` +
        `"<type>(scope): <desc> (${task.id})" — e.g. "fix(math): correct subtract (${task.id})". ` +
        `Do NOT run any lint/typecheck/test yourself, do NOT open a PR. Implement, commit, then stop.`;

    let agentErr = null;
    const t0 = Date.now();
    try {
        sh(`claude -p ${JSON.stringify(prompt)} --permission-mode acceptEdits --max-turns ${maxTurns}`, wt, { timeout: 600000 });
    } catch (e) {
        agentErr = ((e.stdout || "") + (e.stderr || e.message || "")).toString().slice(-800);
    }
    const agentMs = Date.now() - t0;

    // Drop the hidden acceptance test in AFTER the agent finishes (it never saw it).
    if (task.hiddenTest) {
        const srcHidden = join(ROOT, task.hiddenTest);
        const dest = join(wt, "test", basename(task.hiddenTest).replace(".hidden", ""));
        try { cpSync(srcHidden, dest); } catch (e) { console.error("hidden-test copy failed:", e.message); }
    }

    // WRAPPER runs Gate A — the agent does not grade itself.
    let gate;
    try {
        gate = JSON.parse(sh(`node "${VALIDATE}" --target sandbox --path "${wt}" --base ${base} --json`, ROOT));
    } catch (e) {
        try { gate = JSON.parse((e.stdout || "").toString()); }
        catch { gate = { ok: false, results: [], error: ((e.stdout || "") + (e.stderr || e.message || "")).toString().slice(-500) }; }
    }

    const srcDiff = (shSafe(`git diff --name-only ${base}...HEAD -- src`, wt) || "").trim();
    const fullDiff = shSafe(`git diff ${base}...HEAD`, wt) || "";
    const gateOk = !!(gate && gate.ok);
    const negOk = task.negativeControl ? srcDiff === "" : true;
    const passed = gateOk && negOk;

    const result = {
        task: task.id, kind: task.kind, passed,
        gateOk, negativeControl: !!task.negativeControl,
        negControlSatisfied: negOk,
        srcFilesChanged: srcDiff ? srcDiff.split("\n") : [],
        gate: gate?.results || [],
        gateError: gate?.error || null,
        agentDurationMs: agentMs,
        agentError: agentErr,
    };
    writeFileSync(join(outDir, `${task.id}.json`), JSON.stringify(result, null, 2));
    writeFileSync(join(outDir, `${task.id}.diff`), fullDiff);

    const verdict = passed ? "PASS" : "FAIL";
    const gateSummary = (gate?.results || []).map((r) => `${r.name}:${r.status}`).join(" ");
    console.log(`   Gate A: ${gateOk ? "green" : "RED"} · ${gateSummary}`);
    if (task.negativeControl) console.log(`   negative-control (no src change expected): ${negOk ? "ok" : "VIOLATED — agent changed src/"}`);
    console.log(`   → ${verdict}`);

    if (!keep) {
        shSafe(`git worktree remove --force "${wt}"`, SANDBOX);
        shSafe(`git branch -D ${branch}`, SANDBOX);
    } else {
        console.log(`   (kept worktree: ${wt})`);
    }
    return result;
}

console.log(`\nTraining run · ${tasks.length} task(s) · sandbox ${SANDBOX}`);
const results = [];
for (const t of tasks) results.push(runTask(t));

const pass = results.filter((r) => r.passed).length;
console.log(`\n  ${pass}/${results.length} passed · ledger: training/results/${stamp}/`);
process.exit(pass === results.length ? 0 : 1);

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
import { readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fixLoop } from "../scripts/lib/fix-loop.mjs";

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
const ledger = argv.includes("--ledger");   // append the run's pass/total to training/results/trend.jsonl

// Fix-round caps + routing come from the same config as production (ADR-007: caps are config).
const fixCfg = JSON.parse(readFileSync(join(ROOT, "config", "loops.json"), "utf8")).fixRounds;

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

    const taskBase = task.base || base;   // per-task base branch (T1 needs the buggy branch, not main)
    shSafe(`git worktree remove --force "${wt}"`, SANDBOX);
    shSafe(`git branch -D ${branch}`, SANDBOX);
    sh(`git worktree add "${wt}" -b ${branch} ${taskBase}`, SANDBOX);

    // Give the worktree just enough permission for a headless run (untracked, never committed).
    mkdirSync(join(wt, ".claude"), { recursive: true });
    writeFileSync(
        join(wt, ".claude", "settings.local.json"),
        JSON.stringify({ permissions: { allow: ["Bash(git *)", "Bash(node *)", "Edit", "Write", "Read", "Grep", "Glob"] } }, null, 2)
    );

    const prompt =
        `You are on git branch "${branch}" in a small dependency-free Node.js project. Implement this task and NOTHING else:\n\n` +
        `${task.prompt}\n\n` +
        `When done: stage ONLY the files you changed (git add <files>, never -A) and make ONE commit whose ` +
        `subject is a Conventional Commit ending with "(${branch})" — e.g. "fix(math): correct subtract (${branch})". ` +
        `Do NOT run any lint/typecheck/test yourself, do NOT open a PR. Implement, commit, then stop.`;

    let agentErr = null;
    const t0 = Date.now();
    try {
        // Feed the prompt via STDIN, not as a shell arg — the prompt contains quotes and newlines that
        // cmd.exe would mangle ("The system cannot find the file specified"). `claude -p` reads stdin.
        execSync(`claude -p --permission-mode acceptEdits --max-turns ${maxTurns}`, {
            cwd: wt, input: prompt, encoding: "utf8", timeout: 600000, stdio: ["pipe", "pipe", "pipe"],
        });
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
    function runGate() {
        try {
            return JSON.parse(sh(`node "${VALIDATE}" --target sandbox --path "${wt}" --base ${taskBase} --json`, ROOT));
        } catch (e) {
            try { return JSON.parse((e.stdout || "").toString()); }
            catch { return { ok: false, results: [], error: ((e.stdout || "") + (e.stderr || e.message || "")).toString().slice(-500) }; }
        }
    }
    let gate = runGate();

    // Goal-based fix-round loop (ADR-007) — only for tasks that opt in (e.g. T4). Same wrapper-owned
    // loop as production triage.mjs: exact failures → constrained fix agent → FULL gate again.
    let rounds = 0, blocked = null;
    if (task.fixRounds && !gate.ok) {
        const loopRes = fixLoop({
            initialGate: gate,
            runGate,
            runFixAgent: ({ prompt, model, maxTurns: turns, round }) => {
                console.log(`   fix round ${round}: invoking agent...`);
                try {
                    execSync(`claude -p --permission-mode acceptEdits --max-turns ${turns}${model ? ` --model ${model}` : ""}`, {
                        cwd: wt, input: prompt, encoding: "utf8", timeout: 600000, stdio: ["pipe", "pipe", "pipe"],
                    });
                } catch (e) {
                    console.error("   fix-agent error (tail):", ((e.stdout || "") + (e.stderr || e.message || "")).toString().slice(-300));
                }
            },
            git: (cmd) => (shSafe(`git ${cmd}`, wt) || "").trim(),
            cfg: fixCfg, root: ROOT, ticket: task.id, branch, base: taskBase,
            log: (m) => console.log("  " + m),
        });
        gate = loopRes.gate;
        rounds = loopRes.rounds;
        blocked = loopRes.blocked;
    }

    const srcDiff = (shSafe(`git diff --name-only ${taskBase}...HEAD -- src`, wt) || "").trim();
    const fullDiff = shSafe(`git diff ${taskBase}...HEAD`, wt) || "";
    const gateOk = !!(gate && gate.ok);
    const negOk = task.negativeControl ? srcDiff === "" : true;
    // A negative control has nothing to commit, so Gate A (which needs a compliant commit) can't be green.
    // Its ONLY success criterion is honesty: the agent made no src/ change. Everything else is graded by Gate A.
    // A fix-round task can additionally require the loop to have ACTUALLY run (minRounds).
    const roundsOk = task.minRounds ? rounds >= task.minRounds : true;
    const passed = task.negativeControl ? negOk : (gateOk && roundsOk);

    const result = {
        task: task.id, kind: task.kind, passed,
        gateOk, negativeControl: !!task.negativeControl,
        negControlSatisfied: negOk,
        fixRounds: rounds, fixBlocked: blocked, minRounds: task.minRounds || 0,
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
    if (task.fixRounds) console.log(`   fix-loop: ${rounds} round(s) used${blocked ? ` · BLOCKED: ${blocked}` : ""}${task.minRounds ? ` (min required: ${task.minRounds} → ${roundsOk ? "ok" : "NOT MET"})` : ""}`);
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

// Trend ledger (--ledger): one JSONL line per run — the regression signal for changes to OUR system
// (prompts/gates/skills). A task going green→red between lines is a regression; see 12 Loops.md runbook.
if (ledger) {
    const line = {
        stamp, pass, total: results.length,
        perTask: Object.fromEntries(results.map((r) => [r.task, r.passed])),
        rounds: Object.fromEntries(results.filter((r) => r.fixRounds).map((r) => [r.task, r.fixRounds])),
    };
    const trendPath = join(ROOT, "training", "results", "trend.jsonl");
    let regression = false;
    try {
        const lines = readFileSync(trendPath, "utf8").trim().split("\n");
        const prev = JSON.parse(lines[lines.length - 1]);
        const dropped = Object.keys(line.perTask).filter((t) => prev.perTask?.[t] === true && line.perTask[t] === false);
        if (dropped.length) {
            regression = true;
            console.log(`  ⚠ REGRESSION vs previous run: ${dropped.join(", ")} went green→red`);
            mkdirSync(join(ROOT, "state"), { recursive: true });
            writeFileSync(join(ROOT, "state", "ALERT-training-regression.txt"),
                `${new Date().toISOString()}  ${dropped.join(", ")} went green->red (see training/results/${stamp}/)\n`);
        }
    } catch { /* first ledger line — nothing to compare */ }
    appendFileSync(trendPath, JSON.stringify(line) + "\n");
    console.log(`  trend: training/results/trend.jsonl${regression ? "  (ALERT written to state/)" : ""}`);
}

process.exit(pass === results.length ? 0 : 1);

#!/usr/bin/env node
/**
 * triage.mjs — the PRODUCTION triage orchestrator (manual trigger).
 *
 * This is the secure sibling of training/run-training.mjs, and it exists to close P0 #2 and #3:
 *   #3  the agent works in an ISOLATED git worktree off origin/main — NEVER the developer's checkout.
 *   #2  the WRAPPER (this script) runs Gate A. The implement-phase agent cannot run it, cannot push,
 *       cannot open a PR, cannot merge — its allowlist doesn't contain those tools. The gate verdict
 *       is this script's exit code, not something the agent reports about itself.
 *
 * Flow (manual trigger — the owner names the ticket):
 *   1. fetch origin, add a worktree on branch <TICKET> off origin/main
 *   2. copy the target's .claude context INTO the worktree (worktrees don't get gitignored .claude,
 *      so without this the agent would run with NO skills/routing/hook — defeating containment)
 *   3. IMPLEMENT phase: claude -p, constrained allowlist (no gh / no push / no gate-run), implement+commit
 *   4. GATE A (this script): node scripts/validate.mjs --path <worktree> --base origin/main  ← authoritative
 *   4b. GOAL-BASED FIX LOOP (ADR-007, scripts/lib/fix-loop.mjs): on RED, the exact failing checks are
 *       fed to a FIX-phase agent (same constrained allowlist, cheaper model first) and the FULL gate
 *       re-runs — capped at config/loops.json fixRounds.max, with no-progress + diff-growth guards.
 *       tripwire/branch/gate-crash never loop (non-retryable). Exhaustion → state/blocked.json.
 *   5. GATE B + CLOSE phase: only if Gate A is green — a second claude -p with the close allowlist
 *      (gh draft PR + Jira write). Terminal state is a DRAFT PR; never a merge.
 *   6. teardown (unless --keep)
 *
 *   node scripts/triage.mjs --ticket UNP-1234
 *   node scripts/triage.mjs --ticket UNP-1234 --keep            # leave the worktree to inspect
 *   node scripts/triage.mjs --ticket UNP-1234 --max-fix-rounds 0  # disable the fix loop for this run
 *   node scripts/triage.mjs --ticket TEST-1  --dry-run          # stub agent phases; exercise the spine
 *   node scripts/triage.mjs --ticket TEST-1  --dry-run --inject-red 1   # + exercise the fix loop
 *                                                          # (N synthetic RED gates, then real)
 *
 * The live Jira/gh path can only be smoke-tested by the owner (real ai-ready ticket + auth + VPN).
 * --dry-run verifies everything that does NOT need the network.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixLoop } from "./lib/fix-loop.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATE = join(ROOT, "scripts", "validate.mjs");

const argv = process.argv.slice(2);
const getFlag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ticket = getFlag("--ticket");
const targetName = getFlag("--target") || "admin";
const base = getFlag("--base") || "origin/main";
const keep = argv.includes("--keep");
const dryRun = argv.includes("--dry-run");
const planApproved = argv.includes("--plan-approved");   // owner-confirmed the ticket's plan-approved label
const maxTurns = getFlag("--max-turns") || "60";
// --inject-red N (dry-run only): the first N Gate A runs return a SYNTHETIC lint failure, so the
// fix-round loop's mechanics (classify → fix → re-gate → caps/guards) are testable fully offline.
const injectRed = argv.includes("--inject-red") ? Number(getFlag("--inject-red")) || 1 : 0;

// Loop caps + model routing — config, never prompts (ADR-007).
const loopsCfg = JSON.parse(readFileSync(join(ROOT, "config", "loops.json"), "utf8"));
const fixCfg = { ...loopsCfg.fixRounds };
if (getFlag("--max-fix-rounds") !== null) fixCfg.max = Number(getFlag("--max-fix-rounds"));

if (!ticket) { console.error("Usage: node scripts/triage.mjs --ticket <TICKET> [--keep] [--dry-run]"); process.exit(2); }

const config = JSON.parse(readFileSync(join(ROOT, "config", "targets.json"), "utf8"));
const target = config.targets?.[targetName];
if (!target) { console.error(`Unknown target "${targetName}"`); process.exit(2); }
const REPO = target.path;
if (!existsSync(join(REPO, ".git"))) { console.error(`Target repo not a git checkout: ${REPO}`); process.exit(2); }

const sh = (cmd, cwd, opts = {}) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const shSafe = (cmd, cwd) => { try { return sh(cmd, cwd); } catch { return null; } };

const branch = ticket;
const wt = join(ROOT, ".triage-worktrees", ticket);

// ── Allowlists — the mechanical half of #2. The implement agent literally cannot push/PR/merge/gate. ──
const IMPLEMENT_TOOLS = [
    "Read", "Edit", "Write", "Glob", "Grep", "Task",
    "Bash(git add:*)", "Bash(git commit:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git restore:*)",
    // SELF-VERIFICATION (the article's inner agentic loop): the agent may RUN the target's checks in
    // its isolated worktree and sharpen its work until they pass — self-verification, never self-GRADING:
    // the wrapper's Gate A stays the only authoritative verdict. Scoped to workspace check commands
    // (nx targets / tsc / npm scripts / node tests) — NOT a general Bash(node *) shell (exfil surface);
    // the worktree also carries no .env (gitignored → never copied).
    "Bash(npx nx *)", "Bash(npx tsc *)", "Bash(npm test:*)", "Bash(npm run *)", "Bash(node --test*)", "Bash(node tools/*)",
    // read-only Jira + browser (fetch a real API contract) + AAA sync — needed to implement, not to close
    "mcp__atlassian__atlassianUserInfo", "mcp__atlassian__searchJiraIssuesUsingJql", "mcp__atlassian__getJiraIssue",
    "mcp__claude-in-chrome__tabs_context_mcp", "mcp__claude-in-chrome__tabs_create_mcp", "mcp__claude-in-chrome__navigate",
    "mcp__claude-in-chrome__get_page_text", "mcp__claude-in-chrome__read_page", "mcp__claude-in-chrome__read_network_requests",
    "mcp__up-aaa-sync__scan_routes", "mcp__up-aaa-sync__list_service_types", "mcp__up-aaa-sync__list_policies",
    // NOTE: deliberately absent — Bash(gh *), Bash(git push*), Bash(git checkout*), general Bash(node *)/shell, Atlassian writes.
].join(",");
const CLOSE_TOOLS = [
    "Read", "Glob", "Grep",
    "Bash(git push:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git status:*)",
    "Bash(gh pr create:*)", "Bash(gh pr view:*)", "Bash(gh pr list:*)",
    "mcp__atlassian__atlassianUserInfo", "mcp__atlassian__getJiraIssue",
    "mcp__atlassian__transitionJiraIssue", "mcp__atlassian__addCommentToJiraIssue",
    "mcp__up-aaa-sync__sync_actions", "mcp__up-aaa-sync__add_policy", "mcp__up-aaa-sync__assign_action_to_policy",
    // NOTE: no `gh pr merge`, no `gh pr ready`, no push to protected refs — draft PR is the terminal state.
].join(",");

function agent(promptText, allowedTools, label, opts = {}) {
    console.log(`\n▶ ${label} phase (claude -p, cwd=worktree${opts.model ? `, model ${opts.model}` : ""})`);
    if (dryRun) {
        console.log("  [dry-run] skipping the claude call");
        return { skipped: true };
    }
    const modelArg = opts.model ? ` --model ${opts.model}` : "";
    const turns = opts.maxTurns || maxTurns;
    try {
        execSync(`claude -p --permission-mode acceptEdits --allowedTools ${allowedTools} --max-turns ${turns}${modelArg}`,
            { cwd: wt, input: promptText, encoding: "utf8", timeout: 900000, stdio: ["pipe", "pipe", "pipe"] });
        return { skipped: false };
    } catch (e) {
        return { skipped: false, error: ((e.stdout || "") + (e.stderr || e.message || "")).toString().slice(-800) };
    }
}

// ── 1. isolated worktree off origin/main (never the dev's checkout) ──────────────────────────────
console.log(`\ntriage → ${targetName}  ·  ticket ${ticket}  ·  base ${base}${dryRun ? "  (DRY RUN)" : ""}`);
// A real run branches off freshly-fetched origin/main; a dry-run (no network) branches off local HEAD.
const doFetch = !dryRun || argv.includes("--fetch");
if (doFetch) shSafe("git fetch origin", REPO);
const startPoint = doFetch ? base : "HEAD";
// Bulletproof pre-clean: a prior kept/blocked/crashed run may have left the worktree registration,
// the on-disk directory, AND the branch behind — clear all three.
function cleanWorktree() {
    shSafe(`git worktree remove --force "${wt}"`, REPO);
    shSafe("git worktree prune", REPO);
    if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });   // leftover dir from a crash
    shSafe(`git branch -D ${branch}`, REPO);
}
cleanWorktree();
try {
    sh(`git worktree add "${wt}" -b ${branch} ${startPoint}`, REPO);
} catch (e) {
    console.log(`  worktree off ${startPoint} failed (${e.message.split("\n").pop().slice(0, 80)}); cleaning + retrying off HEAD`);
    cleanWorktree();
    sh(`git worktree add "${wt}" -b ${branch} HEAD`, REPO);
}
console.log(`  worktree: ${wt}  (off ${startPoint})`);

// ── 2. copy .claude context into the worktree (gitignored → absent from a fresh worktree) ─────────
const srcClaude = join(REPO, ".claude");
if (existsSync(srcClaude)) {
    cpSync(srcClaude, join(wt, ".claude"), { recursive: true });
    const staleMiss = join(wt, ".claude", ".router-miss.log");
    if (existsSync(staleMiss)) rmSync(staleMiss, { force: true });   // per-run misses only, not carried over
    console.log("  copied .claude context into the worktree (skills/routing/hook/settings)");
} else {
    console.log("  ⚠ target has no .claude — run sync-target first; agent would have no skills");
}

// ── 3. IMPLEMENT phase (constrained) ──────────────────────────────────────────────────────────────
const protocol = readFileSync(join(ROOT, "prompts", "triage.md"), "utf8");
const implementPrompt =
    `Agent-system root: ${ROOT}\nYou are in an ISOLATED worktree already checked out on branch "${branch}" ` +
    `(off ${base}); the ticket is ${ticket}. This is the IMPLEMENT phase ONLY.\n\n` +
    `Do sections 0–4 of the protocol below: health, readiness, spec extraction (untrusted-input firewall), ` +
    `and implement. SELF-VERIFY as you work (the inner agentic loop): run the target's own check commands ` +
    `(lint / typecheck / tests) in this worktree, see what fails, fix, and repeat until YOUR checks are green — ` +
    `do not hand off work you haven't verified. Then stage explicitly (never -A) and make ONE commit ` +
    `"<type>(<scope>): <desc> (${ticket})". Your green checks are NOT the verdict: the wrapper re-runs the ` +
    `authoritative Gate A after you finish, and a later phase closes. Do NOT push or open a PR. ` +
    `When your commit is made, STOP.\n\n---\n${protocol}`;

let implResult = { skipped: true };
if (dryRun) {
    // stub: a minimal, gate-passing commit so the spine (Gate A on the worktree) is exercised for real
    writeFileSync(join(wt, ".triage-dryrun.txt"), "dry-run implement stub\n");
    sh("git add .triage-dryrun.txt", wt);
    sh(`git -c user.email=triage@uphub.local -c user.name="uphub triage" commit -q -m "chore(dryrun): stub implement commit (${ticket})"`, wt);
    console.log("\n▶ IMPLEMENT phase\n  [dry-run] made a stub commit instead of calling claude");
} else {
    implResult = agent(implementPrompt, IMPLEMENT_TOOLS, "IMPLEMENT");
    if (implResult.error) console.log("  implement-phase agent error (tail):\n" + implResult.error);
}

// ── 4. GATE A — the wrapper runs it. Authoritative. The agent never graded itself. ─────────────────
// In dry-run the worktree has no node_modules, so skip the heavy nx checks and exercise the cheap,
// worktree-correctness checks (branch/commit/imports/staged) that prove the spine wired up right.
const gateSkip = dryRun ? " --skip lint,typecheck,test" : "";
const gatePlan = planApproved ? " --plan-approved" : "";   // fail-closed: absent ⇒ security paths hard-block
let gateRuns = 0;
function runGateA() {
    gateRuns++;
    // --inject-red: synthetic RED for the first N runs (offline test of the loop mechanics).
    if (dryRun && gateRuns <= injectRed) {
        console.log(`  [inject-red] synthetic RED gate (${gateRuns}/${injectRed})`);
        return {
            ok: false, results: [
                { name: "branch", status: "pass", detail: "synthetic" },
                { name: "lint", status: "fail", detail: "synthetic lint failure injected by --inject-red:\n  src/example.ts:1:1  no-var  Unexpected var." },
            ],
        };
    }
    let g;
    try {
        g = JSON.parse(sh(`node "${VALIDATE}" --target ${targetName} --path "${wt}" --base ${base}${gateSkip}${gatePlan} --json`, ROOT));
    } catch (e) {
        try { g = JSON.parse((e.stdout || "").toString()); }
        catch { g = { ok: false, results: [], error: ((e.stdout || "") + (e.stderr || e.message || "")).toString().slice(-500) }; }
    }
    const summary = (g.results || []).map(r => `${r.name}:${r.status}`).join(" ");
    console.log(`  Gate A: ${g.ok ? "GREEN" : "RED"} · ${summary}`);
    if (g.error) console.log(`  (gate error: ${g.error})`);
    return g;
}

console.log(`\n▶ GATE A (wrapper runs validate.mjs — authoritative)`);
let gate = runGateA();

// ── 4b. GOAL-BASED FIX LOOP (ADR-007): RED → feed the exact failures to a constrained FIX agent →
// full gate again. Cap + guards are wrapper-enforced; the agent never decides its own continuation.
let blocked = null;
let fixRoundsUsed = 0;
if (!gate.ok) {
    const loopRes = fixLoop({
        initialGate: gate,
        runGate: () => { console.log(`\n▶ GATE A (re-run after fix round)`); return runGateA(); },
        runFixAgent: ({ prompt, model, maxTurns: turns, round }) => {
            if (dryRun) {
                // stub fix: a real commit so HEAD moves and the no-progress guard is exercised honestly
                writeFileSync(join(wt, ".triage-dryrun.txt"), `dry-run fix round ${round}\n`);
                sh("git add .triage-dryrun.txt", wt);
                sh(`git -c user.email=triage@uphub.local -c user.name="uphub triage" commit -q -m "fix(dryrun): stub fix round ${round} (${ticket})"`, wt);
                console.log(`\n▶ FIX round ${round}\n  [dry-run] made a stub fix commit instead of calling claude`);
                return;
            }
            const res = agent(prompt, IMPLEMENT_TOOLS, `FIX round ${round}`, { model, maxTurns: turns });
            if (res.error) console.log("  fix-phase agent error (tail):\n" + res.error);
        },
        git: (cmd) => (shSafe(`git ${cmd}`, wt) || "").trim(),
        cfg: fixCfg, root: ROOT, ticket, branch, base,
        log: (m) => console.log(m),
    });
    gate = loopRes.gate;
    blocked = loopRes.blocked;
    fixRoundsUsed = loopRes.rounds;
    if (blocked) {
        // Mechanical blocked-ledger (no model): the scheduler must never re-pick this ticket, even if
        // the human hasn't labeled it ai-blocked yet. Jira labeling itself is wired in via lib/jira.mjs.
        try {
            mkdirSync(join(ROOT, "state"), { recursive: true });
            const ledgerPath = join(ROOT, "state", "blocked.json");
            const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : {};
            ledger[ticket] = {
                reason: blocked, rounds: fixRoundsUsed, worktree: wt,
                gate: (gate.results || []).filter(r => r.status === "fail").map(r => r.name),
                at: new Date().toISOString(),
            };
            writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
            console.log(`  blocked-ledger updated: state/blocked.json`);
        } catch (e) { console.log(`  (blocked-ledger write failed: ${e.message})`); }
        // Mechanical ai-blocked labeling (ADR-008) — wrapper-computed text, no model. Best-effort:
        // the local ledger above already guarantees the scheduler never re-picks this ticket.
        try {
            const jiraLib = await import("./lib/jira.mjs");
            if (!dryRun && jiraLib.configured()) {
                await jiraLib.addLabel(ticket, "ai-blocked");
                await jiraLib.addComment(ticket,
                    `uphub triage blocked mechanically: ${blocked}. ` +
                    `Failing checks: ${(gate.results || []).filter(r => r.status === "fail").map(r => r.name).join(", ") || "(gate crash)"}. ` +
                    `Fix rounds used: ${fixRoundsUsed}. Worktree kept for inspection on the owner's machine.`);
                console.log("  Jira: ai-blocked label + summary comment added (mechanical, ADR-008)");
            } else if (!dryRun) {
                console.log("  (JIRA_API_TOKEN not configured — label the ticket ai-blocked manually; see ADR-008)");
            }
        } catch (e) { console.log(`  (Jira labeling failed: ${String(e.message).slice(0, 120)} — label manually)`); }
    }
}
const gateSummary = (gate.results || []).map(r => `${r.name}:${r.status}`).join(" ");

// ── 5. CLOSE phase — only if Gate A is green ────────────────────────────────────────────────────
let outcome;
if (!gate.ok) {
    outcome = `TRIAGE-BLOCKED: gate-a${blocked ? ` (${blocked})` : ""}${fixRoundsUsed ? ` after ${fixRoundsUsed} fix round(s)` : ""}`;
    console.log(`\n✗ ${outcome} — worktree kept for inspection; no PR, no Jira change.`);
} else {
    if (fixRoundsUsed) console.log(`\n  (Gate A reached green after ${fixRoundsUsed} fix round(s))`);
    const closePrompt =
        `Agent-system root: ${ROOT}\nBranch "${branch}", ticket ${ticket}. Gate A ALREADY PASSED (the wrapper ran it: ${gateSummary}). ` +
        `This is the GATE-B + CLOSE phase. Do sections 6, 6c, and 7 of the protocol below: a fresh-context ` +
        `review of the diff (git diff ${base}...HEAD), sync AAA permissions if routes/gating changed, then push the ` +
        `branch and open a **DRAFT** PR, transition Jira to "Waiting for CR", and comment the PR URL @-mentioning QA. ` +
        `NEVER merge, mark ready, or push to a protected ref.\n\n---\n${protocol}`;
    if (dryRun) {
        console.log(`\n▶ GATE B + CLOSE phase\n  [dry-run] skipping (needs gh + Jira auth)`);
        outcome = "TRIAGE-DRYRUN-OK (Gate A green; close skipped)";
    } else {
        const closeRes = agent(closePrompt, CLOSE_TOOLS, "GATE B + CLOSE");
        outcome = closeRes.error ? "TRIAGE-CLOSE-ERROR (see worktree)" : "TRIAGE-DONE (see PR)";
        if (closeRes.error) console.log("  close-phase agent error (tail):\n" + closeRes.error);
    }
}

// ── 6. teardown ─────────────────────────────────────────────────────────────────────────────────
if (keep || !gate.ok) {
    console.log(`\n  worktree kept: ${wt}`);
} else if (!dryRun && outcome.startsWith("TRIAGE-DONE")) {
    // the branch is pushed; the local worktree can go. Keep the branch (it's on the remote / in the PR).
    shSafe(`git worktree remove --force "${wt}"`, REPO);
    console.log(`\n  worktree removed (branch ${branch} lives on in the PR)`);
} else {
    shSafe(`git worktree remove --force "${wt}"`, REPO);
    shSafe(`git branch -D ${branch}`, REPO);
    console.log(`\n  worktree + local branch removed`);
}

console.log(`\n${outcome}\n`);
process.exit(gate.ok ? 0 : 1);

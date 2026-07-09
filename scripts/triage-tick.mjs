#!/usr/bin/env node
/**
 * triage-tick.mjs — ONE tick of the time-based loop (ADR-007: the loop shell is deterministic;
 * the model only ever runs inside triage.mjs's constrained phases).
 *
 * Tick = pause-check → quiet-hours → AUTH HEALTH GATE (fail-closed) → daily cap → mechanical poll
 *        (Jira REST, zero model tokens — ADR-008) → dispatch AT MOST ONE ticket to triage.mjs.
 *
 *   node scripts/triage-tick.mjs                # one tick (scheduled entry: triage-loop.ps1)
 *   node scripts/triage-tick.mjs --status       # print state (caps, pause, alerts) and exit
 *   node scripts/triage-tick.mjs --force-hours  # ignore quiet-hours (attended testing)
 *
 * UNATTENDED GATE (12 Loops.md): do NOT register the Windows schedule until the live smoke test +
 * ~5 attended tick runs are green and the pilot cap (dailyTicketCap: 1) has held.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as jira from "./lib/jira.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "state");
mkdirSync(STATE, { recursive: true });

const argv = process.argv.slice(2);
const targetName = (i => i >= 0 ? argv[i + 1] : "admin")(argv.indexOf("--target"));
const forceHours = argv.includes("--force-hours");
const statusOnly = argv.includes("--status");

const loopsCfg = JSON.parse(readFileSync(join(ROOT, "config", "loops.json"), "utf8"));
const cap = loopsCfg.poll?.dailyTicketCap ?? 3;

const today = new Date().toISOString().slice(0, 10);
const dailyPath = join(STATE, `daily-${today}.json`);
const daily = existsSync(dailyPath) ? JSON.parse(readFileSync(dailyPath, "utf8")) : { dispatched: [] };
const blocked = existsSync(join(STATE, "blocked.json")) ? JSON.parse(readFileSync(join(STATE, "blocked.json"), "utf8")) : {};

const log = (m) => console.log(`[tick ${new Date().toISOString()}] ${m}`);
function halt(code, msg) { log(msg); process.exit(code); }

if (statusOnly) {
    console.log(JSON.stringify({
        pause: existsSync(join(STATE, "pause")),
        today, dispatchedToday: daily.dispatched, dailyTicketCap: cap,
        blockedTickets: Object.keys(blocked),
        alerts: ["ALERT-auth.txt", "ALERT-training-regression.txt"].filter(f => existsSync(join(STATE, f))),
        jiraConfigured: jira.configured(),
    }, null, 2));
    process.exit(0);
}

// 1. Kill switch — the ops-affordance pause file wins over everything.
if (existsSync(join(STATE, "pause"))) halt(0, "PAUSED (state/pause exists) — idle tick.");

// 2. Quiet hours / days (defense-in-depth on top of the Task Scheduler window).
if (!forceHours) {
    const now = new Date();
    const day = now.getDay();               // 0=Sun … 6=Sat ; work days Sun-Thu = 0-4
    const hour = now.getHours();
    if (day > 4) halt(0, `quiet day (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]}) — idle tick.`);
    if (hour < 7 || hour >= 18) halt(0, `quiet hours (${hour}:00) — idle tick.`);
}

// 3. Surface any standing alerts where the owner already looks.
for (const f of ["ALERT-auth.txt", "ALERT-training-regression.txt"]) {
    if (existsSync(join(STATE, f))) log(`⚠ standing alert: state/${f} — ${readFileSync(join(STATE, f), "utf8").trim().slice(0, 120)}`);
}

// 4. AUTH HEALTH GATE — fail-closed. Nothing runs on degraded auth; no retry storms.
try {
    const who = await jira.health();
    log(`jira auth ok (${who})`);
} catch (e) {
    writeFileSync(join(STATE, "ALERT-auth.txt"), `${new Date().toISOString()}  Jira auth failed: ${e.message}\n`);
    halt(1, `TRIAGE-HALT: jira-auth (${e.message.slice(0, 120)}) — alert written, nothing dispatched.`);
}
try {
    execSync("gh auth status", { stdio: "pipe" });
    log("gh auth ok");
} catch {
    writeFileSync(join(STATE, "ALERT-auth.txt"), `${new Date().toISOString()}  gh auth status failed\n`);
    halt(1, "TRIAGE-HALT: gh-auth — alert written, nothing dispatched.");
}

// 5. Daily cap (runaway protection — the pilot starts at 1).
if (daily.dispatched.length >= cap) halt(0, `daily cap reached (${daily.dispatched.length}/${cap}) — idle tick.`);

// 6. Mechanical poll (zero model tokens). ai-blocked is excluded in JQL AND re-checked vs the local
// ledger (defense in depth if a label write ever failed).
const jql = `project = UNP AND assignee = currentUser() AND labels = ai-ready AND (labels IS EMPTY OR (labels != ai-needs-info AND labels != ai-blocked)) AND status = "To Do" ORDER BY priority DESC, created ASC`;
let issues;
try { issues = await jira.searchJql(jql, 10); }
catch (e) { halt(1, `TRIAGE-HALT: poll failed (${e.message.slice(0, 120)}).`); }

const candidate = issues.find(i => !blocked[i.key] && !daily.dispatched.includes(i.key));
if (!candidate) halt(0, `TRIAGE-IDLE — no eligible ai-ready ticket (${issues.length} candidates pre-filter).`);

// 7. plan-approved from mechanical ground truth (the ticket's ACTUAL labels, not a human CLI switch).
const planApproved = candidate.labels.includes("plan-approved");
log(`dispatching ${candidate.key} ("${candidate.summary.slice(0, 60)}")${planApproved ? " [plan-approved]" : ""} — ${daily.dispatched.length + 1}/${cap} today`);

// Record BEFORE dispatch (crash-safety: a crashed run must not be re-picked into a duplicate PR).
daily.dispatched.push(candidate.key);
writeFileSync(dailyPath, JSON.stringify(daily, null, 2) + "\n");

// 8. Dispatch — one unit of work per tick, streamed to the console/log.
try {
    execSync(`node "${join(ROOT, "scripts", "triage.mjs")}" --ticket ${candidate.key} --target ${targetName}${planApproved ? " --plan-approved" : ""}`,
        { cwd: ROOT, stdio: "inherit", timeout: 2 * 60 * 60 * 1000 });
    log(`tick done — ${candidate.key} completed (see triage output above).`);
} catch {
    log(`tick done — ${candidate.key} exited nonzero (blocked or failed; worktree kept, see state/blocked.json).`);
    process.exit(1);
}

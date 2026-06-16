#!/usr/bin/env node
/**
 * uphub-agents — FIRST-RUN SETUP (one time, per machine).
 *
 *   node scripts/setup.mjs
 *
 * Interactively configures the agent for THIS developer and writes machine-local config
 * (config/local.json + config/browser.json — both gitignored). After this, the agent
 * knows: which repo to work on, how to reach Jira + GitHub, who reviews the code, who QAs,
 * which Google account to use in the browser, and how often it wakes up.
 *
 * Re-run any time to change settings.
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rl = createInterface({ input, output });
const ask = async (q, def) => {
    const a = (await rl.question(`  ${q}${def ? ` [${def}]` : ""}: `)).trim();
    return a || def || "";
};
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };

console.log(`
============================================================
  uphub-agents — first-run setup
  One-time configuration for THIS machine. Writes
  config/local.json + config/browser.json (both gitignored).
============================================================
`);

/* 1 — target repo */
console.log("\n[1/6] Target repo (the codebase the agent works on)");
const targetName = await ask("Repo name", "admin");
const targetPath = await ask("Local path to it", `C:/Users/${process.env.USERNAME || "you"}/Desktop/${targetName}`);

/* 2 — Jira */
console.log("\n[2/6] Jira (auth is via the Atlassian MCP in Claude Code)");
const cloudId = await ask("Jira cloudId", "f3b4c353-309f-4d7e-909f-cf58d20d674d");
const project = await ask("Project key", "UNP");

/* 3 — GitHub */
console.log("\n[3/6] GitHub");
const ghUser = sh("gh api user --jq .login");
if (ghUser) console.log(`  ✓ gh authenticated as: ${ghUser}`);
else console.log("  ⚠ gh not authenticated — run `gh auth login` before the agent opens PRs.");

/* 4 — reviewers + QA (roster from uphub-skills config if present) */
console.log("\n[4/6] Code reviewer & QA tester");
const uphubCfg = join(homedir(), ".claude", "unplugged-tasks", "config.json");
let reviewers = [], qaTesters = [];
if (existsSync(uphubCfg)) {
    try {
        const c = JSON.parse(readFileSync(uphubCfg, "utf8"));
        reviewers = (c.reviewers || c.prReviewers || []).map(r => (typeof r === "string" ? { name: r } : r));
        qaTesters = (c.qaTesters || []).map(r => (typeof r === "string" ? { name: r } : r));
    } catch { /* ignore */ }
}
async function pickPeople(label, list, multi) {
    if (!list.length) {
        const free = await ask(`${label} (comma-separated names)`, "");
        return free ? free.split(",").map(s => s.trim()).filter(Boolean) : [];
    }
    list.forEach((p, i) => console.log(`    ${i + 1}) ${p.name}${p.defaultSelected ? "  (default)" : ""}`));
    const defIdx = list.map((p, i) => p.defaultSelected ? i + 1 : null).filter(Boolean).join(",");
    const ans = await ask(`${label} — pick number${multi ? "(s, comma-separated)" : ""}`, defIdx || "1");
    return ans.split(",").map(s => list[Number(s.trim()) - 1]?.name).filter(Boolean);
}
const defaultReviewers = await pickPeople("Code reviewer", reviewers, true);
const qaDefaultArr = await pickPeople("QA tester", qaTesters, false);
const qaDefault = qaDefaultArr[0] || "";

/* 5 — browser account */
console.log("\n[5/6] Browser account (for internal IP-restricted tools: swagger, etc.)");
const email = await ask("Google account email Chrome uses", "you@gmail.com");

/* 6 — schedule */
console.log("\n[6/6] Schedule (how often the agent wakes to scan ai-ready tickets)");
const everyMinutes = Number(await ask("Run every N minutes (0 = manual only)", "30"));

/* write */
const local = {
    _generated: "by scripts/setup.mjs — machine-local, gitignored. Re-run setup to change.",
    target: { name: targetName, path: targetPath.replace(/\\/g, "/") },
    jira: { cloudId, project },
    github: { account: ghUser, defaultReviewers },
    qaTester: qaDefault,
    schedule: { everyMinutes, workHours: "7-18", days: "Sun-Thu" }
};
writeFileSync(join(ROOT, "config", "local.json"), JSON.stringify(local, null, 2) + "\n");
writeFileSync(join(ROOT, "config", "browser.json"), JSON.stringify({ internalAccessEmail: email }, null, 2) + "\n");

console.log(`
------------------------------------------------------------
  ✅ Setup complete — wrote config/local.json + config/browser.json

  Target   : ${targetName}  (${local.target.path})
  Jira     : ${project} @ ${cloudId.slice(0, 8)}…
  GitHub   : ${ghUser || "(not authed)"}
  Reviewers: ${defaultReviewers.join(", ") || "(none)"}
  QA       : ${qaDefault || "(none)"}
  Browser  : ${email}
  Schedule : ${everyMinutes > 0 ? `every ${everyMinutes} min, 7-18, Sun-Thu` : "manual only"}

  Next:
   • Register the AAA-sync MCP (once): claude mcp add up-aaa-sync -s user -- npx -p up-aaa-sync up-aaa-sync-mcp
   • Init AAA on the target (once):   npx up-aaa-sync init ${targetPath.replace(/\\/g, "/")}  (then fill .aaa.config.json DB creds)
   • Sync context into the target:   node scripts/sync-target.mjs --target ${targetName}
   • Generate L3/L4 context:         node scripts/harvest-context.mjs --target ${targetName}
   • Run once now:                   pwsh scripts/run-headless.ps1${everyMinutes > 0 ? `\n   • Install the schedule:           pwsh scripts/install-scheduler.ps1 -IntervalMinutes ${everyMinutes}` : ""}
------------------------------------------------------------
`);
rl.close();

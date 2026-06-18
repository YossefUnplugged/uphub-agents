#!/usr/bin/env node
/**
 * Replay benchmark harness (Phase 1). Scores the agent against historical UNP tickets.
 *
 *   node benchmark/run.mjs --target admin [--dry-run] [--case UNP-6841]
 *
 * --dry-run (works here): loads cases, fetches ground-truth files from the merged PR via
 *   `gh`, and prints what a real run would expect — validates the harness wiring without
 *   invoking Claude.
 * live run (needs a CLEAN Claude profile + node_modules in the target): for each case it
 *   would checkout the PR base, run the implementer headless on `prompt`, run Gate A
 *   (validate.mjs), diff touched-vs-ground-truth files, and score per rubric.md.
 *
 * Running the implementer is intentionally gated behind --live because it must happen on a
 * clean profile (no plugins) to mean anything — see rubric.md.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const args = process.argv.slice(2);
const targetName = args[args.indexOf("--target") + 1] || "admin";
const dryRun = args.includes("--dry-run") || !args.includes("--live");
const onlyCase = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;

const config = JSON.parse(readFileSync(join(REPO_ROOT, "config", "targets.json"), "utf8"));
const target = config.targets[targetName];
const gh = (c) => execSync(`gh ${c}`, { cwd: target.path, encoding: "utf8" }).trim();

const caseDir = join(HERE, "cases");
const cases = readdirSync(caseDir).filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(join(caseDir, f), "utf8")))
    .filter(c => !onlyCase || c.key === onlyCase);

console.log(`\nReplay benchmark · target ${targetName} · ${cases.length} case(s) · ${dryRun ? "DRY-RUN (harness check)" : "LIVE"}\n`);

let pass = 0, total = 0;
for (const c of cases) {
    total++;
    console.log(`── ${c.key}  (PR #${c.groundTruthPr}, base ${c.baseRef}) — ${c.area}`);
    let gtFiles = [];
    try {
        const pr = JSON.parse(gh(`pr view ${c.groundTruthPr} --json files,title`));
        gtFiles = (pr.files || []).map(f => f.path);
        console.log(`   ground-truth title: ${pr.title}`);
        console.log(`   ground-truth files (${gtFiles.length}): ${gtFiles.slice(0, 12).join(", ")}${gtFiles.length > 12 ? " …" : ""}`);
        const touchesTypes = gtFiles.some(f => f.startsWith("libs/admin-types"));
        console.log(`   shared-types involved (crit #3): ${touchesTypes ? "YES — agent MUST touch libs/admin-types" : "no"}`);
    } catch (e) {
        console.log(`   ⚠️ could not fetch PR #${c.groundTruthPr}: ${e.message.split("\n")[0]}`);
    }

    if (dryRun) {
        console.log(`   prompt: ${c.prompt.slice(0, 90)}…`);
        console.log(`   [dry-run] would: checkout ${c.baseRef} → run implementer → validate.mjs → score vs ${gtFiles.length} files\n`);
        continue;
    }

    // LIVE (clean-profile only): sketch — implement, gate, score
    try {
        execSync(`git checkout ${c.baseRef}`, { cwd: target.path, stdio: "pipe" });
        try { execSync(`git branch -D ${c.key}`, { cwd: target.path, stdio: "pipe" }); } catch { /* no prior branch */ }
        // Branch == ticket id so it passes the validator's `^UNP-\d+$` gate (a `bench/` prefix would fail Gate A spuriously).
        execSync(`git checkout -b ${c.key}`, { cwd: target.path, stdio: "pipe" });
        // The implementer MUST commit, or `git diff ${baseRef}...HEAD` sees nothing (0% recall) and Gate A's commit-regex fails.
        const prompt = `You are on branch ${c.key} (base ${c.baseRef}) in the ${targetName} repo. Implement this ticket:\n\n${c.prompt}\n\nWhen done: stage ONLY the files you changed (\`git add <files>\`, never \`-A\`) and make ONE commit with a Conventional-Commits subject ending in (${c.key}) — e.g. \`fix(store): resolve search loading bug (${c.key})\`.`;
        execSync(`claude -p ${JSON.stringify(prompt)} --permission-mode acceptEdits`, { cwd: target.path, stdio: "inherit" });
        const gateA = (() => { try { execSync(`node "${join(REPO_ROOT, "scripts", "validate.mjs")}" --target ${targetName}`, { stdio: "pipe" }); return true; } catch { return false; } })();
        const changed = execSync(`git diff --name-only ${c.baseRef}...HEAD`, { cwd: target.path, encoding: "utf8" }).split("\n").filter(Boolean);
        const overlap = changed.filter(f => gtFiles.includes(f)).length;
        const recall = gtFiles.length ? overlap / gtFiles.length : 0;
        const typesOk = !gtFiles.some(f => f.startsWith("libs/admin-types")) || changed.some(f => f.startsWith("libs/admin-types"));
        const ok = gateA && recall >= 0.7 && typesOk;
        if (ok) pass++;
        console.log(`   Gate A: ${gateA ? "green" : "RED"} · file recall: ${(recall * 100).toFixed(0)}% · shared-types: ${typesOk ? "ok" : "MISSED"} → ${ok ? "PASS" : "FAIL"}\n`);
    } catch (e) { console.log(`   run error: ${e.message.split("\n")[0]}\n`); }
}

if (!dryRun) {
    const pct = total ? Math.round((pass / total) * 100) : 0;
    console.log(`\n  ${pass}/${total} passed (${pct}%) · exit gate: ${pct >= 80 ? "✓ MET (≥80%)" : "✗ not met"}\n`);
}

#!/usr/bin/env node
/**
 * lint-changed.mjs — diff-scoped ESLint for Gate A.
 *
 * Lints ONLY the files the change touched (base...HEAD), so pre-existing repo debt (admin has
 * ~25k historical violations from years of never running lint) cannot block a ticket — the same
 * judge-the-change principle as validate.mjs's diff-scoped forbidden-imports. The team's full-repo
 * `nx run-many -t lint` remains available for burning the debt down separately.
 *
 * Runs with cwd = the target repo (validate.mjs invokes check commands that way) and uses the
 * TARGET's own eslint + config via the Node API — no shell command-length limits on Windows.
 *
 *   node scripts/lint-changed.mjs --base origin/main         # inside the target repo/worktree
 *
 * Exit: 0 = no lintable changes OR no errors (warnings allowed) · 1 = errors · 2 = setup problem
 * (missing eslint/config — validate.mjs classifies that as tooling-broken → WARN, not a code fail).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const getFlag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const base = getFlag("--base") || "origin/main";
const CWD = process.cwd();

let changed;
try {
    changed = execSync(`git diff --name-only --diff-filter=d ${base}...HEAD`, { cwd: CWD, encoding: "utf8" })
        .split("\n").map(s => s.trim()).filter(Boolean)
        .filter(f => /\.(ts|tsx|js|jsx)$/.test(f))
        .filter(f => existsSync(join(CWD, f)));
} catch (e) {
    console.error(`lint-changed: could not diff against ${base}: ${e.message.split("\n")[0]}`);
    process.exit(2);
}

if (!changed.length) {
    console.log(`lint-changed: no lintable (ts/tsx/js/jsx) files in ${base}...HEAD — nothing to lint.`);
    process.exit(0);
}

// Use the TARGET's own eslint installation + cascading config (.eslintrc.json at its root).
// createRequire resolves the real entry point (lib/api.js in eslint 8) from the target's node_modules.
let eslintEntry;
try {
    eslintEntry = createRequire(join(CWD, "package.json")).resolve("eslint");
} catch {
    console.error("lint-changed: eslint is not installed in the target repo (node_modules/eslint missing).");
    process.exit(2);
}

const { ESLint } = await import(pathToFileURL(eslintEntry).href);
const eslint = new ESLint({ cwd: CWD });
const results = await eslint.lintFiles(changed);

const errors = results.reduce((n, r) => n + r.errorCount, 0);
const warnings = results.reduce((n, r) => n + r.warningCount, 0);
if (errors + warnings > 0) {
    const formatter = await eslint.loadFormatter("stylish");
    console.log(await formatter.format(results));
}
console.log(`lint-changed: ${changed.length} changed file(s) · ${errors} error(s), ${warnings} warning(s)${errors ? "" : " — PASS"}`);
process.exit(errors ? 1 : 0);

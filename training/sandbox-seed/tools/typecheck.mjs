// Stand-in "typecheck" for the dependency-free sandbox: syntax-checks every .mjs with `node --check`,
// then dynamically imports each module so a broken import path (the JS analog of TS2307) also fails.
import { readdirSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SKIP = new Set(["node_modules", ".git", ".claude"]);
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (extname(p) === ".mjs") out.push(p);
    }
    return out;
}

const files = walk(process.cwd());
let failed = 0;

for (const f of files) {
    try {
        execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    } catch (e) {
        failed++;
        console.error(`SYNTAX ERROR: ${f}\n${(e.stderr || e.stdout || e.message || "").toString()}`);
    }
}

// Import src modules to catch bad import specifiers (missing files / wrong paths).
for (const f of files.filter((f) => f.replace(/\\/g, "/").includes("/src/"))) {
    try {
        await import(pathToFileURL(resolve(f)).href);
    } catch (e) {
        failed++;
        console.error(`IMPORT ERROR: ${f}\n${(e && e.message) || e}`);
    }
}

console.log(failed ? `typecheck: ${failed} error(s)` : `typecheck: clean (${files.length} files)`);
process.exit(failed ? 1 : 0);

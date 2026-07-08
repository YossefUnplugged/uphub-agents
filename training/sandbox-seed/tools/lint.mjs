// Tiny deterministic linter for the sandbox (no eslint dependency). Scans src/ and test/ only.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const RULES = [
    { name: "no-var", re: /(^|[^.\w])var\s/, msg: "use let/const, not var" },
    { name: "no-loose-eq", re: /[^=!<>]==[^=]/, msg: "use === / !== (strict equality)" },
    { name: "no-console-in-src", re: /console\.\w+\(/, msg: "no console.* in source files", srcOnly: true },
];

function walk(dir, out = []) {
    try {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p, out);
            else if (extname(p) === ".mjs") out.push(p);
        }
    } catch { /* dir may not exist */ }
    return out;
}

let violations = 0;
for (const dir of ["src", "test"]) {
    for (const f of walk(dir)) {
        const isSrc = f.replace(/\\/g, "/").includes("src/") && !f.replace(/\\/g, "/").includes("test/");
        const lines = readFileSync(f, "utf8").split("\n");
        lines.forEach((line, i) => {
            for (const r of RULES) {
                if (r.srcOnly && !isSrc) continue;
                if (r.re.test(line)) {
                    violations++;
                    console.error(`${f}:${i + 1}  [${r.name}] ${r.msg}\n    ${line.trim()}`);
                }
            }
        });
    }
}

console.log(violations ? `\nlint: ${violations} problems (${violations} errors)` : "lint: clean");
process.exit(violations ? 1 : 0);

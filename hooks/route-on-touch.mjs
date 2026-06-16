#!/usr/bin/env node
/**
 * route-on-touch — PreToolUse hook (Edit|Write).
 *
 * Reads the routing table synced to <repo>/.claude/context/routing.json, matches the
 * file being edited against path globs, and injects the matched `hint`(s) as
 * additionalContext — REFERENCE guidance scoped to the current edit, never imperative
 * commands (see docs/SPIKE-0.1-route-on-touch.md). Unmapped source paths are logged as
 * router-misses. Never blocks; always exits 0.
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));               // <repo>/.claude/hooks
const ROUTING = join(HERE, "..", "context", "routing.json");
const MISS_LOG = join(HERE, "..", ".router-miss.log");

function readStdin() { try { return readFileSync(0, "utf8"); } catch { return ""; } }

// minimal glob → RegExp: supports **, *, and {a,b,c} alternation
function globToRegExp(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
            else re += "[^/]*";
        } else if (c === "{") {
            const end = glob.indexOf("}", i);
            const alts = glob.slice(i + 1, end).split(",").map(s => s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"));
            re += "(?:" + alts.join("|") + ")";
            i = end;
        } else if (".+^$()|[]\\".includes(c)) {
            re += "\\" + c;
        } else re += c;
    }
    return new RegExp("^" + re + "$");
}

function main() {
    let data = {};
    try { data = JSON.parse(readStdin()); } catch { /* ignore */ }
    const tool = data?.tool_name || "";
    const cwd = (data?.cwd || process.cwd()).replace(/\\/g, "/");
    let file = (data?.tool_input?.file_path || "").replace(/\\/g, "/");
    if (!file || !/^(Edit|Write|MultiEdit)$/.test(tool)) return ok();

    // only act on files INSIDE the target repo (skip memory, temp, other dirs)
    if (!file.startsWith(cwd)) return ok();
    const rel = file.slice(cwd.length).replace(/^\//, "");

    if (!existsSync(ROUTING)) return ok();
    let table;
    try { table = JSON.parse(readFileSync(ROUTING, "utf8")); } catch { return ok(); }

    const hints = [];
    const skills = new Set(table.alwaysLoad || []);
    let matched = false;
    for (const route of table.routes || []) {
        if (globToRegExp(route.glob).test(rel)) {
            matched = true;
            if (route.hint) hints.push(route.hint);
            (route.skills || []).forEach(s => skills.add(s));
        }
    }

    // router-miss: only flag real source files under apps/ or libs/
    if (!matched && /^(apps|libs)\//.test(rel) && /\.(ts|tsx)$/.test(rel)) {
        try { appendFileSync(MISS_LOG, `router-miss: ${rel}\n`); } catch { /* ignore */ }
    }

    if (hints.length || skills.size) {
        const ctx = [
            "Project conventions for the file you are editing (" + rel + "):",
            ...hints.map(h => "• " + h),
            "Applicable skills: " + [...skills].join(", ") + ". Apply these patterns to THIS edit."
        ].join("\n");
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", additionalContext: ctx }
        }));
    }
    process.exit(0);
}
function ok() { process.exit(0); }
main();

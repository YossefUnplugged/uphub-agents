#!/usr/bin/env node
/**
 * lint-docs — the Lint operation of the llm-wiki pattern, for the architecture vault.
 *
 * Mechanical, deterministic health checks on docs/architecture/*.md:
 *   ERROR  ghost wikilink        — a [[target]] that resolves to no file
 *   WARN   missing frontmatter   — note lacks tags / status / updated
 *   WARN   orphan note           — no other note links to it (meta `_*` + hub excluded)
 *   WARN   hub gap               — a numbered component note not linked from the hub/MOC
 *
 * Semantic contradiction checks ("blocked" vs "done", note disagrees with code) are the
 * job of the maintaining-the-architecture-wiki skill (an LLM), not this script.
 *
 * Usage:  node scripts/lint-docs.mjs [vault-dir]      (default: docs/architecture)
 * Exit 1 if any ERROR, else 0.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(REPO_ROOT, "docs", "architecture");
const HUB = "uphub - Agent Overview";

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) { if (name !== ".obsidian") walk(p, out); }
        else out.push(p);
    }
    return out;
}

if (!existsSync(VAULT)) { console.error(`vault not found: ${VAULT}`); process.exit(2); }

const files = walk(VAULT);
const mdFiles = files.filter(f => f.endsWith(".md"));
const relNoExt = (f) => relative(VAULT, f).replace(/\\/g, "/").replace(/\.(md|canvas)$/i, "");
const baseNoExt = (f) => basename(f).replace(/\.(md|canvas)$/i, "");

// resolution sets: every way a [[link]] may legitimately name a file
const relSet = new Set(files.map(relNoExt));                          // "decisions/ADR-002 ..."
const baseSet = new Set(files.map(baseNoExt));                        // "ADR-002 ..."
const canvasFull = new Set(files.filter(f => f.endsWith(".canvas")).map(f => basename(f))); // "Pipeline Map.canvas"

const errors = [];
const warns = [];
const inbound = new Map(mdFiles.map(f => [relNoExt(f), 0]));          // note -> inbound link count

function resolves(target) {
    if (relSet.has(target) || baseSet.has(target)) return true;
    if (target.toLowerCase().endsWith(".canvas")) return canvasFull.has(target) || baseSet.has(target.replace(/\.canvas$/i, ""));
    return false;
}

for (const f of mdFiles) {
    const rel = relative(VAULT, f).replace(/\\/g, "/");
    const text = readFileSync(f, "utf8");

    // frontmatter (leading --- ... ---)
    const fm = text.startsWith("---") ? text.slice(3, text.indexOf("\n---", 3)) : "";
    for (const field of ["tags", "status", "updated"]) {
        if (!new RegExp(`^${field}\\s*:`, "m").test(fm)) warns.push(`${rel}: missing frontmatter '${field}:'`);
    }

    // wikilinks — ignore links inside code (fenced ``` and inline `…`), which are examples, not links
    const prose = text
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`\n]*`/g, "");
    const links = [...prose.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].split("|")[0].split("#")[0].trim());
    for (const t of links) {
        if (!t) continue;
        if (!resolves(t)) errors.push(`${rel}: ghost link [[${t}]] — resolves to no file`);
        else {
            // credit inbound (match by rel or basename)
            const hit = [...inbound.keys()].find(k => k === t || baseNoExt(join(VAULT, k + ".md")) === t);
            if (hit) inbound.set(hit, inbound.get(hit) + 1);
        }
    }
}

// orphan notes (exclude meta _*, the hub itself)
for (const [note, n] of inbound) {
    const bn = note.split("/").pop();
    if (n === 0 && note !== HUB && !bn.startsWith("_")) warns.push(`${note}: orphan — no other note links to it`);
}

// hub coverage: every "NN ..." component note linked from the hub
const hubFile = mdFiles.find(f => baseNoExt(f) === HUB);
if (hubFile) {
    const hubText = readFileSync(hubFile, "utf8");
    for (const f of mdFiles) {
        const bn = baseNoExt(f);
        if (/^\d\d\s/.test(bn) && !hubText.includes(`[[${bn}`)) warns.push(`hub: '${bn}' is not linked from ${HUB}`);
    }
} else {
    errors.push(`hub note '${HUB}.md' not found`);
}

// report
console.log(`\nlint-docs · ${mdFiles.length} notes in ${relative(REPO_ROOT, VAULT).replace(/\\/g, "/")}\n`);
for (const w of warns) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(`\n  ${errors.length} error(s) · ${warns.length} warning(s)\n`);
process.exit(errors.length ? 1 : 0);

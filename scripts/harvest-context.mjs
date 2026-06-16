#!/usr/bin/env node
/**
 * harvest-context — generate L3 (monorepo map) + L4 (per-package inventory) for a target.
 *
 * L3 → <target>/.claude/context/repo-map.md   (gitignored — full reference)
 * L4 → managed block inside each package's nested CLAUDE.md (auto-loaded by Claude Code
 *      when editing files in that package). Nested CLAUDE.md is NOT gitignored, so it is
 *      written but must never be committed — validate.mjs `staged` guard is the safety net.
 *
 * Stops the agent from re-discovering the codebase every run, and cuts tokens (read one
 * generated file instead of grepping the tree).
 *
 * Usage: node scripts/harvest-context.mjs --target admin
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targetName = args[args.indexOf("--target") + 1] || "admin";
const config = JSON.parse(readFileSync(join(REPO_ROOT, "config", "targets.json"), "utf8"));
const target = config.targets?.[targetName];
if (!target) { console.error(`Unknown target "${targetName}"`); process.exit(2); }
const ROOT = target.path;

const BEGIN = "<!-- BEGIN agent-system:generated -->";
const END = "<!-- END agent-system:generated -->";
const stamp = new Date().toISOString();

const exists = (p) => existsSync(join(ROOT, p));
const lsDirs = (p) => { try { return readdirSync(join(ROOT, p)).filter(n => statSync(join(ROOT, p, n)).isDirectory()); } catch { return []; } };
const lsFiles = (p, re) => { try { return readdirSync(join(ROOT, p)).filter(n => re.test(n) && statSync(join(ROOT, p, n)).isFile()); } catch { return []; } };
const stem = (f) => f.replace(/\.(ts|tsx)$/, "");

function mergeManaged(file, block) {
    let existing = "";
    if (existsSync(file)) existing = readFileSync(file, "utf8");
    const wrapped = `${BEGIN}\n${block}\n${END}`;
    if (existing.includes(BEGIN) && existing.includes(END)) {
        return existing.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), wrapped);
    }
    return (existing ? existing.trimEnd() + "\n\n" : "") + wrapped + "\n";
}
function writeFile(abs, content) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`  write ${abs.replace(ROOT, "").replace(/\\/g, "/")}`);
}

/* ---------- L3: monorepo map ---------- */
function buildRepoMap() {
    let projects = {};
    // best-effort: nx graph JSON; fall back to project.json files
    try {
        const tmp = join(ROOT, ".claude", "context", "_nxgraph.json");
        mkdirSync(dirname(tmp), { recursive: true });
        execSync(`npx nx graph --file="${tmp}"`, { cwd: ROOT, stdio: "pipe" });
        const g = JSON.parse(readFileSync(tmp, "utf8"));
        const nodes = g.graph?.nodes || {};
        const deps = g.graph?.dependencies || {};
        for (const [name, node] of Object.entries(nodes)) {
            projects[name] = {
                type: node.type,
                targets: Object.keys(node.data?.targets || {}),
                deps: (deps[name] || []).map(d => d.target).filter(t => nodes[t])
            };
        }
    } catch {
        for (const base of ["apps", "libs"]) {
            for (const d of lsDirs(base)) {
                const pj = join(ROOT, base, d, "project.json");
                if (existsSync(pj)) {
                    try {
                        const j = JSON.parse(readFileSync(pj, "utf8"));
                        projects[j.name || d] = { type: base === "apps" ? "app" : "lib", targets: Object.keys(j.targets || {}), deps: j.implicitDependencies || [] };
                    } catch { /* ignore */ }
                }
            }
        }
    }
    const lines = [
        "# Repo Map (L3) — generated",
        `> generated: ${stamp} · regenerate: \`node scripts/harvest-context.mjs --target ${targetName}\` · do NOT commit`,
        "",
        "## Projects & dependencies",
        ""
    ];
    for (const [name, p] of Object.entries(projects)) {
        lines.push(`- **${name}** (${p.type}) — targets: ${p.targets.join(", ") || "none"}${p.deps.length ? ` — depends on: ${p.deps.join(", ")}` : ""}`);
    }
    lines.push("", "## Path aliases", "- `@admin-types` → `libs/admin-types/src/index.ts` (both apps)", "- `@admin-backend` → `apps/admin_backend/src/index.ts` (client: AppRouter TYPE only — `import type`)", "");
    lines.push("## Ports & proxy", "- backend `:3000` · client `:4000` (base `/admin`) · nginx `/api`→backend, `/api/ws`→backend WS", "");
    return lines.join("\n");
}

/* ---------- L4: per-package inventories ---------- */
function backendInventory() {
    const routes = lsFiles("apps/admin_backend/src/trpc/routes", /\.ts$/).map(stem);
    const controllers = lsFiles("apps/admin_backend/src/trpc/controllers", /\.ts$/).map(stem);
    const integrations = ["redis", "rabbitMQ", "MicrosoftGraph", "utils"].filter(d => exists(`apps/admin_backend/src/${d}`));
    return [
        "## Backend inventory (L4) — generated",
        `> generated: ${stamp} · do NOT commit · regenerate via harvest-context`,
        "",
        "Express + tRPC, CommonJS. Entry `src/server.ts`; AppRouter exported from `src/index.ts`.",
        `- **tRPC routes** (\`src/trpc/routes/\`): ${routes.join(", ") || "—"}`,
        `- **Controllers** (\`src/trpc/controllers/\`): ${controllers.join(", ") || "—"}`,
        `- **Integrations**: ${integrations.join(", ") || "—"} (RabbitMQ is non-fatal at startup — check connection first)`,
        "- Each route is thin → delegates to its controller; inputs via Zod; failures as typed TRPCError.",
        "- Skills: admin-routing, admin-api-design, admin-services, admin-caching. Run typecheck: `npx nx run admin_backend:typecheck:remote`.",
        "- Full map: `.claude/context/repo-map.md`."
    ].join("\n");
}
function clientInventory() {
    const features = lsDirs("apps/admin_client/src/components");
    const reduxFiles = [...lsFiles("apps/admin_client/src/redux", /\.ts$/), ...lsDirs("apps/admin_client/src/redux").flatMap(d => lsFiles(`apps/admin_client/src/redux/${d}`, /\.ts$/).map(f => `${d}/${stem(f)}`))].map(stem);
    const hooks = lsFiles("apps/admin_client/src/hooks", /\.(ts|tsx)$/).map(stem);
    return [
        "## Client inventory (L4) — generated",
        `> generated: ${stamp} · do NOT commit · regenerate via harvest-context`,
        "",
        "React 18 + Vite, ESM. Entry `src/main.tsx`. Auth via @azure/msal-*; tRPC via splitLink (ws+http).",
        `- **Component areas** (\`src/components/\`): ${features.join(", ") || "—"}`,
        `- **Redux** (\`src/redux/\`): ${reduxFiles.join(", ") || "—"}`,
        `- **Shared hooks** (\`src/hooks/\`): ${hooks.join(", ") || "—"}`,
        "- Components: arrow fn + inline destructured props + default export (admin-conventions). Styling: MUI + tss-react.",
        "- Skills: admin-components, admin-forms, admin-state, admin-errors. Never import backend runtime — `@admin-backend` is type-only.",
        "- Full map: `.claude/context/repo-map.md`."
    ].join("\n");
}
function typesInventory() {
    let exportsList = [];
    const idx = join(ROOT, "libs/admin-types/src/index.ts");
    if (existsSync(idx)) {
        const txt = readFileSync(idx, "utf8");
        exportsList = [...txt.matchAll(/export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g)].map(m => m[1]);
    }
    return [
        "## Shared types inventory (L4) — generated",
        `> generated: ${stamp} · do NOT commit · regenerate via harvest-context`,
        "",
        "`libs/admin-types` — single source of truth for FE/BE contract types. Consumed via `@admin-types`.",
        `- **Re-exported modules** (from \`src/index.ts\`): ${exportsList.join(", ") || "—"}`,
        "- Add a cross-boundary type HERE and re-export from `src/index.ts`; never duplicate a type locally in an app."
    ].join("\n");
}

/* ---------- run ---------- */
console.log(`\nharvest-context → ${target.displayName}\n`);
writeFile(join(ROOT, ".claude", "context", "repo-map.md"), buildRepoMap());
if (exists("apps/admin_backend")) writeFile(join(ROOT, "apps/admin_backend/CLAUDE.md"), mergeManaged(join(ROOT, "apps/admin_backend/CLAUDE.md"), backendInventory()));
if (exists("apps/admin_client")) writeFile(join(ROOT, "apps/admin_client/CLAUDE.md"), mergeManaged(join(ROOT, "apps/admin_client/CLAUDE.md"), clientInventory()));
if (exists("libs/admin-types")) writeFile(join(ROOT, "libs/admin-types/CLAUDE.md"), mergeManaged(join(ROOT, "libs/admin-types/CLAUDE.md"), typesInventory()));
console.log(`\n  done. NOTE: nested CLAUDE.md files are untracked — never \`git add\` them (validate.mjs guards this).\n`);

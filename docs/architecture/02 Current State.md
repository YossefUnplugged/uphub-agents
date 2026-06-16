---
tags: [agent-ecosystem, inventory]
status: snapshot
updated: 2026-06-11
---

# 02 Current State

> **TL;DR:** Two working layers already exist — uphub-skills (intake/closing) and the ada plugin (execution). The gaps: layers 3–4 missing, duplicated rules, no machine gates, and most critically — none of the context lives in the repo itself.

## Asset 1 — `uphub-skills` (pipeline stages 1 + 3)

Repo: `C:\Users\YossefBenHaim\uphub-skills` → installed to `~/.claude/skills/`. Local, interactive, human-gated by design (every Jira write behind AskUserQuestion).

| Skill | Does |
|---|---|
| `/create-task-for-session-uphub` | Creates UNP ticket, sets sprint + estimate, assigns QA, transitions to In Progress, cuts branch `UNP-NNNN`, registers session in `~/.claude/unplugged-tasks/sessions.json`, logs scope to repo `CLAUDE.md`. Delegates admin-repo work to `/task-intake`. |
| `/scaner-my-missions-uphub` | Read-mostly sprint audit; cross-refs Jira vs local session registry; flags orphans. |
| `/create-pr-and-update-uphub` | Validates branch `^UNP-\d+$`, runs `/code-review` as gate, opens PR via `gh` with reviewers from config, transitions Jira to Waiting for CR, comments PR URL, @mentions QA. |

Team config (`config.json`): 5 QA testers, 22 PR reviewers (Ziv Gabel + Naama Lugasi default), repo list, Jira cloud ID + transition fallbacks. **This is the org-level roster — single source of truth for people.**

## Asset 2 — `admin-development-assistant` plugin ("ada" v3.0.0, stage 2)

Repo: `C:\Users\YossefBenHaim\.claude\plugins\admin-development-assistant` (also this Obsidian vault). Installed **only on one machine** — invisible to any remote runner.

- **21 skills**: task-intake, admin-api-design, admin-routing, admin-services, admin-caching, admin-components, admin-forms, admin-state, admin-errors, admin-conventions, admin-testing, admin-git, admin-diagrams, figma-to-code, postman-ai-skills, monitor-ci, link-workspace-packages, nx-workspace, nx-run-tasks, nx-generate, nx-plugins.
- **Agent team** (experimental, in-process): Team Lead (1053-line orchestration doc) → Backend + Frontend + Architect parallel → Tester → Reviewer sequential. Mandatory intake phases, plan approval, commit-per-agent, Postman collections uploaded to Jira via curl, Windows-safe `gh pr create --body-file`.
- **MCP**: Atlassian (OAuth), GitHub (PAT), Figma. **config/**: jira field IDs + app mappings, reviewers. **rules/**: git-conventions.json, workflow-rules.json. **hooks/**: completion sound, Jira transitions, Postman generation, QA diagram.

## Asset 3 — the `admin` repo

Nx monorepo: `apps/admin_backend` (Express+tRPC, CommonJS), `apps/admin_client` (React 18+Vite, ESM), `libs/admin-types`. Root `CLAUDE.md` is good (commands, architecture, conventions: 4-space indent, double quotes, semicolons, 140 max line, `UNP-XXXX` branches). Jenkins is CI.

> ⚠️ **The critical finding:** `admin/.gitignore` ignores `.claude/` and `docs/`, and `CLAUDE.md` is **untracked**. A remote runner cloning this repo today gets **zero agent context**. Also, root `CLAUDE.md` mixes two lifetimes: stable system overview + machine-local "Active Jira Tasks" session state (written by the uphub skill) — these must split before committing. See [[05 Context Layers]].

## Gap analysis vs the 4 layers

| Layer | Coverage | Evidence |
|---|---|---|
| L1 system overview | ✅ good | Root CLAUDE.md + plugin README — but untracked |
| L2 conventions + router | ⚠️ strong content, weak structure | 21 skills exist; git conventions duplicated in **3 places** (plugin CLAUDE.md, rules/git-conventions.json, admin-git skill); component syntax duplicated in 3 skills; **no deterministic router** — agents pick skills by judgment |
| L3 package structure / deps | ❌ missing | Paths hardcoded in skills; no nx-graph awareness; no `paths.json`; brittle to any restructure |
| L4 per-package local context | ❌ missing | No inventory of existing tRPC routers, Redux state shapes, shared hooks, error codes, `@admin-types` exports — agents rediscover by reading code each run (slow, inconsistent, hallucination-prone) |

## Other gaps

1. **No machine gates.** The Reviewer teammate judges "pattern compliance" by reading — nothing runs lint/tsc/tests as a hard exit-code gate before a PR.
2. **Machine-local everything.** Plugin + skills + MCP auth all live on one laptop. Bus factor 1; remote runs impossible.
3. **`/monitor-ci` exists but nothing uses it** — no loop closes after the PR opens.
4. **No security posture** for the day ticket text starts driving a credentialed agent ([[08 Security Model]]).

Next: [[03 Target Architecture]] · decisions that resolve these gaps: [[decisions/ADR-001 Repo Over Plugin]], [[decisions/ADR-002 Route On Touch]]

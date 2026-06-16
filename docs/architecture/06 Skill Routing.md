---
tags: [agent-ecosystem, routing, skills]
status: design
updated: 2026-06-11
source-of-truth-when-built: admin/.claude/rules/skill-routing.md + admin/.claude/settings.json (hook)
---

# 06 Skill Routing

> **TL;DR:** Deterministic routing keyed on files actually touched (route-on-touch), not on plan-time guessing. Plus the dedupe plan: every rule gets exactly one canonical file.

## Why not route-on-plan (the rejected first design)

First idea: the plan step outputs a file list; a table maps globs → skills. Adversarial review killed it: the file list is produced **before** any domain skill is loaded — the judgment just moves upstream, ungated. Worse, a glob table is blind to **omissions**: a frontend-only plan for a full-stack ticket routes only frontend skills, the agent duplicates a type locally instead of extending `@admin-types`, everything compiles, all gates are green — a convention violation with mechanical sign-off. [[decisions/ADR-002 Route On Touch]]

## The design: three mechanisms, layered

### 1. Route-on-touch (deterministic, the core)
A `PreToolUse` hook on Edit/Write matches the **actual file path being modified** against the routing table and injects the mapped skill *at edit time*. The agent cannot edit `apps/admin_backend/src/trpc/routes/storeRoute.ts` without the tRPC patterns being in context — no judgment involved.

Routing table (canonical: `admin/.claude/rules/skill-routing.md`; globs reference `.claude/config/paths.json`):

| Path glob (file being edited) | Inject skill |
|---|---|
| `apps/admin_backend/src/trpc/{routes,controllers}/**` | admin-api-design |
| `apps/admin_backend/src/redis/**` | admin-caching |
| `apps/admin_backend/src/{rabbitMQ,utils,MicrosoftGraph}/**` | admin-services |
| `apps/admin_client/src/components/**` | admin-components |
| `**/*Form.tsx`, `apps/admin_client/src/**/forms/**` | admin-forms |
| `apps/admin_client/src/redux/**` | admin-state |
| `libs/admin-types/**` | admin-api-design + admin-components (both sides of the contract) |
| `**/*.test.{ts,tsx}`, `**/__tests__/**` | admin-testing |
| *(always, session start)* | admin-conventions + `.claude/rules/*` |

Unmapped path ⇒ the hook emits a `router-miss: <path>` line that the validator requires in the PR body — every miss is audited and feeds table growth.

**Mechanism** (so a builder doesn't have to invent it): the hook is configured in `admin/.claude/settings.json` as a `PreToolUse` matcher on `Edit|Write` running `.claude/scripts/route.mjs`. The script receives the tool-input JSON, matches `file_path` against the `paths.json` globs, and returns hook output whose `additionalContext` carries the mapped SKILL.md body (no-op if that skill was already injected this session). Unmatched paths append to `.claude/.router-miss.log` (untracked); the validator reads the log at PR time and writes the `router-miss` lines into the PR body.

### 2. Planner thin context (handles the chicken-and-egg)
The plan step doesn't get domain skills — it gets a permanently-loaded **thin layer**: L1 + L3 repo map + a cross-cutting checklist:

> - tRPC change ⇒ consider route + controller + `libs/admin-types` + client call site
> - New shared type ⇒ `libs/admin-types/src/index.ts` re-export, never a local duplicate
> - New env var ⇒ `.env.example` + CI profile note
> - API surface change ⇒ Postman collection regeneration

Cheap, always-on, and aimed exactly at the omission failure mode.

### 3. Omission detector (the safety net, in the validator)
Mechanical cross-checks on the **final diff**: touches `trpc/routes/**` without `trpc/controllers/**` or `libs/admin-types/**` ⇒ warning in PR body; defines a type in the client that name-matches an `@admin-types` export ⇒ warning; etc. Warnings don't block — they inform the human reviewer where to look.

**Ticket labels are NOT a routing key** (human-entered, will drift). Labels gate *triggering* (`ai-ready`) and *approval* (`plan-approved`), never skill selection.

## Deduplication plan — single source of truth

Granularity stays: **dedupe content, don't merge skills.** Route-on-touch rewards granular skills (editing a Redis file should load caching patterns, not a 4-skill "backend vertical" blob). The earlier 21→12 merge idea is rejected for domain skills.

| Truth | Canonical file (after Phase 1) | Duplicates to delete or turn into pointers |
|---|---|---|
| Branch naming + commit format | `admin/.claude/rules/git-conventions.md` | plugin `rules/git-conventions.json` · `admin-git` skill (**delete**) · agent-teams/CLAUDE.md git sections · regex copy in `create-pr-and-update-uphub` (keeps one annotated line) |
| React component syntax (arrow fn, destructured props, no React.FC) | `admin-components` SKILL.md | `admin-conventions` component section · `admin-forms` repeat · agent-teams/CLAUDE.md ~line 915 · teammate prompt embeds |
| Code style that ESLint already enforces (indent, quotes, semicolons, line length) | **deleted from all prose** — "run the validator" replaces ~200 lines of style text | `admin-conventions` keeps only what lint cannot check: naming, file placement, import direction |
| Jira field IDs / app mappings / upload procedure | `admin/.claude/config/jira.json` | plugin `config/jira-config.json` (reads repo copy) · plugin CLAUDE.md inline copy |
| Execution order / forbidden actions | `admin/.claude/rules/workflow.md` | plugin `rules/workflow-rules.json` · agent-teams/CLAUDE.md (keeps orchestration-only content) |
| People (reviewers, QA) | `uphub-skills/config.json` (org-level; the repo lives on GitHub at `werunplugged/uphub-skills`, so it is reachable remotely) | plugin `config/reviewers.json` (**delete**) · `admin/.claude/config/reviewers.json` is a synced copy (drift PRs) that remote runs read |

Skill count after dedupe: 20 (21 − `admin-git`; `figma-to-code`, `admin-diagrams`, `link-workspace-packages` stay plugin-local since they need MCP/GUI; the rest move to `admin/.claude/skills/`).

Related: [[04 Agent Roster]] · [[05 Context Layers]] · [[decisions/ADR-002 Route On Touch]]

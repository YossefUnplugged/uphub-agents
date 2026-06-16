# Unplugged Agent System

A standalone, **local-only** system that turns a Jira ticket into a standards-compliant draft PR — an "autonomous junior developer" that runs on the developer's own machine.

> Design record (the full 16-doc plan + ADRs + diagram) lives in Obsidian at
> `…/.claude/plugins/admin-development-assistant/docs/agent-ecosystem/`.
> A Hebrew explainer of every doc: open `explainer.html` in that folder.
> This repo is the **implementation** of that design — scripts, config, rules, skills.

## Why a separate repo

The original plan committed all agent context into the `admin` repo (ADR-001), which was blocked on opening `admin`'s `.gitignore` (assumption A1, needs Head-R&D sign-off). Making this its own repo **sidesteps that block entirely**. Because execution is local-only (ADR-006), the local agent simply reads context from this central repo while operating on any target repo (`admin` today, Kotlin/Java repos later). This is the "standards repo" approach the design kept as a fallback — now promoted to primary.

## The model in one picture

```
Jira ticket (label: ai-ready)
        │
        ▼
  this repo's brain  ──reads──>  target repo (admin / …)
   • standards (org rules)
   • rules + skills (L2)
   • per-target context (L3/L4)
   • scripts: validate / harvest
        │
        ▼
  single implementer agent  →  Gate A (validate.mjs)  →  Gate B (fresh-context review)
        │
        ▼
  DRAFT PR + Jira → Waiting for CR        (human reviews & merges — always)
```

## Layout

```
unplugged-agent-system/
  README.md                  ← this file
  config/
    targets.json             ← every target repo: path, languages, check commands, conventions
  scripts/
    validate.mjs             ← Gate A: the deterministic machine gate (lint/tsc/test/regex/imports)
    harvest-context.mjs      ← (later) generates L3/L4 context for a target
  standards/                 ← (later) org-level canonical rules: git conventions, jira workflow, reviewers
  rules/                     ← (later) skill-routing table, code-style not enforceable by lint
  skills/                    ← (later) deduplicated domain skills moved out of the ada plugin
  targets/
    admin/                   ← per-target context for the admin repo (L1 committed CLAUDE.md, L3 repo-map)
```

## Status

**Phase 0 — deterministic foundation (built & unit-verified):**
- [x] `config/targets.json` — admin target (checks, conventions, forbidden-imports, omission rules, `onboarded` kill switch)
- [x] `scripts/validate.mjs` — Gate A (branch/commit/imports/omission/**staged-path guard**/lint/typecheck/test), runnable, caught a real import violation
- [x] `skills/` — 10 deduped admin-code skills (admin-conventions canonical)
- [x] `rules/routing.json` + `hooks/route-on-touch.mjs` — route-on-touch (verified firing in real + headless sessions; see `docs/SPIKE-0.1`)
- [x] `standards/{git.md,jira.md}` — org rules (roster stays canonical in uphub config)
- [x] `scripts/sync-target.mjs` — stamps 13 files into `admin/.claude/` (gitignored, settings.local untouched, idempotent)
- [x] `scripts/harvest-context.mjs` — L3 repo-map (nx graph) + L4 per-package inventories
- [ ] **0.8 clean-profile smoke test** — user-run gate (see Verification)

**Phase 1 — benchmark (built; awaits clean-profile run):**
- [x] `benchmark/{run.mjs, rubric.md, cases/}` — harness + scoring + real UNP cases (ground truth via `gh`; needs a permitted IP)

**Phase 2 — local automation (built as runnable drafts; await live Jira+gh):**
- [x] `prompts/triage.md` — the triage protocol (poll → readiness → spec → implement → Gate A → Gate B → draft PR → Jira+QA)
- [x] `scripts/run-headless.ps1` — one headless triage run (Phase 2a, manual trigger)
- [x] `scripts/triage-loop.ps1` + `scripts/install-scheduler.ps1` — single-instance loop + Windows Task Scheduler (Phase 2b, unattended)

Autonomy rollout (owner decision): **manual trigger first** (`run-headless.ps1`), then unattended (`install-scheduler.ps1`) once trusted.

## Usage (so far)

```bash
# Run the machine gate against a target repo (cheap checks only — fast):
node scripts/validate.mjs --target admin --only branch,commit,imports

# Full gate (runs nx lint/typecheck/test in the target — slower, needs node_modules there):
node scripts/validate.mjs --target admin --base origin/main
```

Git is intentionally not initialized here yet — building first, versioning later.

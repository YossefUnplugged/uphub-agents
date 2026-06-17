---
tags: [agent-ecosystem, moc]
status: living
updated: 2026-06-17
---

# 00 Home — Agent Ecosystem Map of Content

> **TL;DR:** The master map of the agent ecosystem — what exists, what gets built, in what order, who owns what. Any model starting work begins here. Execution is **local-only** by owner decision (ADR-006).

This folder (`docs/architecture/` in the **`uphub-agents`** repo) is the **canonical design record** for Unplugged's deterministic AI dev-agent ecosystem — the "remote junior developer" that takes a Jira ticket in and delivers a standards-compliant draft PR out. (Edit it here; Obsidian opens this same folder as a vault for graph/canvas — there is no second copy.)

**Rule of authority:** these notes are the *design-time* truth (the "why"). The *execution-time* truth is the shipped artifacts in this same repo — `prompts/`, `standards/`, `skills/`, `scripts/`, `rules/`, `hooks/`, `config/` (and what `sync-target.mjs` stamps into `admin/.claude/**`). If a note disagrees with a shipped script/skill, **the script wins** — then fix the note.

## Reading order (for humans and for models)

1. [[01 Vision and Methodology]] — what we're building and the 4-layer context method
2. [[02 Current State]] — what exists today (uphub-skills, ada plugin, admin repo) and the gaps
3. [[03 Target Architecture]] — the end-to-end pipeline
4. [[04 Agent Roster]] — every agent/skill/script: role, trigger, guardrails
5. [[05 Context Layers]] — where each of the 4 layers lives as files
6. [[06 Skill Routing]] — deterministic route-on-touch + deduplication plan
7. [[07 Remote Execution]] — execution & automation (LOCAL-ONLY by decision; remote research kept as future reference — ADR-006)
8. [[08 Security Model]] — untrusted input, platform enforcement, tripwires
9. [[09 Roadmap]] — phases, build order, the replay benchmark exit gate
10. [[10 Ecosystem Map]] — admin's verified integrations + the org repo landscape (which repos/languages the agent can get tasks for, and what "onboarded" means)
11. [[11 Profiles and Niches]] — CORE vs pluggable NICHE profiles: how the same engine replicates to a new codebase (Java/Android)

Decisions live in [[decisions/ADR-001 Repo Over Plugin|decisions/]] — read an ADR before re-opening a settled argument.

Visual overview: [[Pipeline Map.canvas|Pipeline Map]]

## Status dashboard

| Component | Stage | Status | Effort | Note |
|---|---|---|---|---|
| `/create-task-for-session-uphub` | Intake | ✅ exists | — | [[04 Agent Roster]] |
| `/scaner-my-missions-uphub` | Audit | ✅ exists | — | [[04 Agent Roster]] |
| `/create-pr-and-update-uphub` | Closing | ✅ exists | — | [[04 Agent Roster]] |
| ada plugin (21 skills, agent team) | Execution | ✅ exists (source for the deduped skills) | — | [[02 Current State]] |
| Standalone `uphub-agents` repo + `sync-target.mjs` → `admin/.claude/` | Foundation | ✅ done (supersedes A1 / the gitignore blocker — dead) | — | [[05 Context Layers]] · ADR-001 |
| compliance-validator script (Gate A) | Gate | ✅ built (caught a real violation) | — | [[04 Agent Roster]] |
| context-harvester (L3/L4 generator) | Context | ✅ built | — | [[04 Agent Roster]] |
| Skill dedupe + move into repo (incl. `admin-design` design system) | Routing | ✅ done (11 skills) | — | [[06 Skill Routing]] |
| route-on-touch hook | Routing | ✅ built (fires in real + headless) | — | [[06 Skill Routing]] |
| Replay benchmark (Phase 1 exit) | Quality | 🔨 built; awaits clean-profile run | M | [[09 Roadmap]] |
| Clean-profile smoke test (Phase 0 exit / kill switch) | Quality | ⏳ user-run gate (pending) | M | [[09 Roadmap]] |
| pr-feedback skill (local, via `gh`) | Automation | 🔨 Phase 2 | S | [[07 Remote Execution]] |
| auto-triage + close + scheduler (local headless) | Automation | 🔨 built as drafts; await a live Jira+gh run | L | [[07 Remote Execution]] |

## Build status (2026-06-14)

Implementation lives in `Desktop/unplugged-agent-system` (separate repo, supersedes the "inside admin" approach — A1 is dead). Plan: `~/.claude/plans/soft-juggling-sphinx.md`.
- **Phase 0 (deterministic foundation):** built & unit-verified — validator (Gate A) with staged-path guard, 10 deduped skills, routing table, route-on-touch hook (fires in real + headless sessions), `sync-target.mjs` (stamps 13 files into admin/.claude, settings.local untouched), `harvest-context.mjs` (L3 nx-graph map + L4 per-package inventories). Remaining: 0.8 clean-profile smoke test (user-run gate).
- **Phase 1 (benchmark):** harness + rubric + real cases built; awaits a clean-profile run.
- **Phase 2 (local automation):** triage + close + scheduler scripts built as runnable drafts; await a live Jira+gh run. Autonomy: manual trigger first, then unattended (owner decision).

## The one-paragraph summary

Three pipeline stages already have owners: **intake/closing** is `uphub-skills` (human-gated, local), **execution** is the `admin-development-assistant` plugin. What's missing is not more prompts — it's (a) the context layers 3–4 that make output deterministic, (b) machine-checkable gates instead of model self-judgment, (c) moving execution-critical rules from one laptop's plugin into the repo so every machine — and the clean-profile benchmark — sees the same truth, and (d) safe local automation. Execution is **local-only** by owner decision ([[decisions/ADR-006 Local Only Execution]]): the roadmap takes today's human-in-the-loop flow to scheduled autonomous runs on the owner's machine, with human PR review as a permanent gate.

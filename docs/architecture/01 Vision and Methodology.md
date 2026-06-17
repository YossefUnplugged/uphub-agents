---
tags: [agent-ecosystem, vision, methodology]
status: stable
updated: 2026-06-11
---

# 01 Vision and Methodology

> **TL;DR:** The goal — an autonomous junior developer running on the owner's machine: ticket in, standards-compliant code out, draft PR opened, Jira updated. Determinism comes from context layers + machine gates, not from bigger prompts.

## The north star: an autonomous junior developer (on the owner's machine)

A Jira ticket labeled ready → an agent **running locally, only on the owner's machine** ([[decisions/ADR-006 Local Only Execution]]) checks out a branch named `UNP-NNNN` → implements following team conventions → tests/lint/typecheck pass → a **draft PR** opens with the right reviewers → Jira moves to *Waiting for CR* and QA is mentioned. A human always reviews and merges. The agent's terminal state is **always a draft PR — never a merge**.

### Success criteria ("done" is observable, not vibes)

1. **Determinism**: a clean Claude profile with zero plugins, pointed at the repo, produces convention-compliant code. Measured by the replay benchmark in [[09 Roadmap]].
2. **Trust**: 22 developers can review a stream of agent PRs without rubber-stamping — every PR carries machine-validation results and a fresh-context review summary ([[08 Security Model]]).
3. **No new manual work**: ticket hygiene the team already does (estimate, QA assignee, acceptance criteria) is the only input the agent needs.

## The 4-layer deterministic context methodology

The conference insight this design implements: **the fix is not a better prompt — it's an architecture that forces the AI to work deterministically.** Constrain the model through layered context and rules so it becomes a precise engineering tool, not a creative guessing engine.

| Layer | Question it answers | Claude Code primitive | Where it lives (see [[05 Context Layers]]) |
|---|---|---|---|
| **L1 — Copilot Instructions** (system view) | What is this project? How is it built? What are the big principles? | Root `CLAUDE.md` (committed) | `admin/CLAUDE.md` |
| **L2 — Coding Instructions** (rules + router) | Conventions, code standards, error handling, architectural templates. Routes the right skill to the right task. | `.claude/rules/*.md`, `.claude/skills/*`, route-on-touch hook | `admin/.claude/rules/`, `admin/.claude/skills/` |
| **L3 — Package Structure** (architecture + deps) | Where am I in the monorepo? What depends on what? What does a change here affect? | Generated repo map + nx graph | `admin/.claude/context/repo-map.md` (generated) |
| **L4 — Package Instructions** (local context) | This package's internal APIs, state shapes, local patterns. Prevents hallucinated, non-compiling code. | Nested `CLAUDE.md` per package + generated inventories | `apps/*/CLAUDE.md`, `libs/*/CLAUDE.md` + `_inventory.md` |

The skills ecosystem (composition, data-fetching, scaffolds, styling) is the modular L2 — each skill is a command for one specific engineering task, not one giant prompt.

**Process:** Project → Conventions/Skills → Structure → Local Context → precise code.

## Design principles (settled — see ADRs before reopening)

1. **Context + machine gates over prompt size.** Determinism comes from layered context and exit-code gates (lint, tsc, tests, regex checks), never from longer instructions. [[decisions/ADR-004 Single Agent Remote]]
2. **The repo is the shared substrate.** Anything execution-critical lives in the repo, not in one machine's plugin — so every teammate's machine, a clean profile, and the replay benchmark all see identical rules (and remote runners too, if that door ever opens). [[decisions/ADR-001 Repo Over Plugin]]
3. **Prompt rules are UX; platform rules are security.** "Never push main" is enforced by branch protection, not by asking nicely. [[08 Security Model]]
4. **Human merge is permanent.** Autonomy ends at the draft PR. [[decisions/ADR-003 Draft PR Autonomy]]
5. **Single source of truth, everywhere.** Every rule has exactly one canonical file; everything else points at it. [[06 Skill Routing]]

## Scope

- **Now:** the `admin` Nx monorepo (Express+tRPC backend, React 18+Vite client, shared types lib).
- **Later:** `shopping-server` (Kotlin), `rss-feed-service` (Kotlin), `shopping-google-scraper` (TS) onboard via the per-repo skeleton in [[05 Context Layers]].

Related: [[02 Current State]] · [[03 Target Architecture]] · [[00 uphub - Agent Overview]]

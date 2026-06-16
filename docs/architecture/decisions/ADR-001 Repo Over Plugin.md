---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-06-11
---

# ADR-001 — Execution-critical context lives in the repo, not the plugin

**Status:** Accepted, then **REFINED by the standalone-repo pivot (2026-06-14, see [[decisions/ADR-006 Local Only Execution]])** · **Drives:** [[05 Context Layers]], [[09 Roadmap]]

> **PIVOT UPDATE (2026-06-14):** The principle stands — execution-critical context must NOT live only in a machine's plugin. But the *destination* changed. Instead of committing context into the `admin` repo (which needed assumption A1: opening admin's `.gitignore` + Head-R&D sign-off), the context now lives in a **standalone repo** (`Desktop/unplugged-agent-system`) and a `sync-target.mjs` script stamps it into `admin/.claude/` — which is **already gitignored**, so it's local-only, invisible to admin's git, and needs no approval. Because execution is local-only ([[decisions/ADR-006 Local Only Execution]]), the agent reads this synced context natively. **Net effect: A1 is dead.** Verified: 13 files sync into admin/.claude/, admin git stays clean, the clean-profile benchmark still works because the synced skills load with zero plugins.

## Context
The ada plugin (21 skills, rules, config) exists only on one developer machine. Verified facts: GitHub Actions auto-loads repo-committed `.claude/` but not machine plugins; cloud Routines load repo `.claude/` but no plugins; a clean checkout of `admin` today contains **zero agent context** (`.gitignore` blocks `.claude/` and `docs/`; `CLAUDE.md` untracked).

## Decision
Every execution-critical artifact — L1–L4 context, rules, domain skills, routing table, validator script, Jira field config — moves into the `admin` repo under version control. The plugin demotes to an **operator console**: interactive intake UX, Figma MCP, reviewer picker GUI, sounds, opt-in agent-team mode, this Obsidian vault.

## Consequences
- ✅ Local, Actions, and Routine runs read identical context; rules are code-reviewed like code; bus factor > 1.
- ⚠️ Requires Head-R&D buy-in for gitignore surgery (assumption A1, riskiest in the design). Fallback documented in [[05 Context Layers]].
- ⚠️ Plugin files that duplicated rules become pointers — see the dedupe table in [[06 Skill Routing]].
- ❌ Rejected alternative: installing the plugin in CI via `plugins:` input — forks truth between repo and plugin again, and Routines can't use it at all.

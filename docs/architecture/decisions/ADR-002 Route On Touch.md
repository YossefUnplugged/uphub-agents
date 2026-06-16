---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-06-11
---

# ADR-002 — Skill routing happens on file-touch, not on plan output

**Status:** Accepted (amended after adversarial review) · **Drives:** [[06 Skill Routing]]

## Context
Deterministic skill selection can't key on ticket prose. First design routed on the *planned file list* through a glob table. Adversarial review found two fatal flaws: (1) the plan step runs **before** skills load, so the judgment is just moved upstream, ungated; (2) glob tables only catch **commission** (touched an unmapped path) and are structurally blind to **omission** (frontend-only plan for a full-stack ticket → type duplicated locally instead of extending `@admin-types` → all gates green, convention violated).

## Decision
Three layered mechanisms:
1. **Route-on-touch:** a PreToolUse hook on Edit/Write injects the mapped skill when the agent *actually edits* a matching path — deterministic, no judgment.
2. **Planner thin context:** the plan step gets L1 + L3 repo map + a cross-cutting checklist ("tRPC change ⇒ route + controller + types + client") — aimed at the omission failure mode.
3. **Omission detector** in the validator: mechanical cross-checks on the final diff, warnings into the PR body.

Ticket labels are never a routing key. Unmapped paths emit audited `router-miss` lines.

## Consequences
- ✅ Determinism where it's achievable, audit trail where it isn't; granular skills stay (the 21→12 merge is rejected for domain skills — route-on-touch rewards precision).
- ⚠️ Hooks don't execute in GitHub Actions — verify hook config via repo `.claude/settings.json` during the Phase-2 spike; fallback: same table as a mandatory prompt step + validator audit of loaded-skill claims.

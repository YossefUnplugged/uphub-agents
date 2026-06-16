---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-06-11
---

# ADR-004 — One implementer + machine gates on the remote path (5-agent team stays local, opt-in)

**Status:** Accepted (amended: fresh-context review pass added; **local sub-agent fan-out allowed, 2026-06-15**) · **Drives:** [[03 Target Architecture]], [[04 Agent Roster]]

> **AMENDMENT (2026-06-15) — local worktree sub-agents.** The single-implementer rule was motivated by (a) parallel builders colliding on `libs/admin-types`, and (b) the experimental agent-teams feature being unavailable in cloud/Actions. Neither fully applies on the **local** path (ADR-006): the Agent tool supports `isolation: "worktree"` (no disk collision) and `model: "sonnet"` (cheaper builders). So the coordinator MAY now fan out to **N sub-agents at its own discretion** (2 = backend/frontend, or more), each on Sonnet in its own worktree — **provided** the shared contract (`libs/admin-types`) is written by the coordinator FIRST, before fan-out. That ordering removes the original collision. The coordinator stays on the stronger model and integrates the worktrees before the gates. Single-implementer remains valid for small/single-surface tickets.

## Context
The plugin's 5-agent team (Team Lead → Backend + Frontend + Architect → Tester → Reviewer) is a local luxury: the experimental agent-teams feature doesn't exist in Actions/Routines, parallel builders collide on `libs/admin-types` (most full-stack changes touch shared types), and multi-agent orchestration multiplies tokens, latency, and nondeterminism. But collapsing to one agent naively deletes the only role with *different epistemics* — a reviewer that didn't write the code.

## Decision
Remote path: **one implementer** writing code + tests together, then two gates with different epistemics:
- **Gate A — compliance-validator (a script, not an agent):** lint, `tsc -b`, tests, branch/commit regexes, forbidden imports, omission detector, secret scan. Exit codes don't negotiate.
- **Gate B — fresh-context review pass:** `/code-review` + `/security-review` invoked clean, on the diff only — it never saw the implementation reasoning, so it can't be charmed by it. Unresolved CRITICAL/HIGH findings block the draft PR.

Tester teammate absorbed (tests are part of implementation; the validator runs them). Reviewer teammate demoted to Gate B's skill content. Team mode survives **locally** as explicit opt-in for L-sized tickets.

## Consequences
- ✅ Determinism from context + gates, not agent count; remote pipeline works in every execution path.
- ✅ One skeptical reader retained at ~one extra invocation, zero orchestration complexity.
- ⚠️ The 1053-line orchestration doc gets carved: workflow rules → repo `.claude/rules/workflow.md`; team choreography stays plugin-local. Sunk cost stays sunk.

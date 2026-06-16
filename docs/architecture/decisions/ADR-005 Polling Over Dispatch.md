---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-06-11
---

# ADR-005 — Scheduled Jira polling instead of Jira-fired repository_dispatch

**Status:** Accepted, then **deferred by [[decisions/ADR-006 Local Only Execution]]** — the polling *topology* survives (the local scheduler polls Jira the same way); the GitHub-Actions execution part applies only if remote is ever revisited · **Drives:** [[07 Remote Execution]]

## Context
Original design: Jira Automation rule fires `repository_dispatch` on `ai-ready` labeling, which requires Jira Automation to **hold a GitHub PAT** — a write-capable GitHub credential stored in Atlassian config (visible to Jira admins, outside the GitHub secret-rotation story, bound to a personal account, org-wide blast radius). Meanwhile Phase 3 already commits to a polling cadence for nightly triage.

## Decision
Delete `repository_dispatch` from the design. A **scheduled GitHub Actions workflow** (e.g., every 15 min during work hours) polls Jira via JQL (`labels = ai-ready AND status = "To Do"`) using a **Jira service-account API token stored in GitHub secrets**. GitHub-side writes use a **repo-scoped GitHub App** with short-lived installation tokens.

## Consequences
- ✅ Credential flow inverted: one Jira read/write token in the better store; **no GitHub-write capability lives in Atlassian at all**.
- ✅ One trigger mechanism for Phase 2 and Phase 3 (same workflow, different cadence/caps).
- ⚠️ Up to ~15 min pickup latency — irrelevant for a "remote junior developer."
- ❌ Rejected alternatives: Jira-held PAT (above); Atlassian Forge app (build+maintain cost unjustified at this scale).

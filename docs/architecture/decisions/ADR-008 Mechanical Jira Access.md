---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-07-09
---

# ADR-008 — A scoped local Jira API token for mechanical loop control

**Status:** Accepted (owner approved, 2026-07-09) · **Amends:** [[decisions/ADR-006 Local Only Execution]]'s "no new credentials" consequence · **Drives:** `scripts/lib/jira.mjs`, `scripts/triage-tick.mjs`

## Context
The scheduled (time-based) loop needs a **ticket source**: find the next `ai-ready` ticket without waking a model. The options were (a) a small `claude -p` poll via the Atlassian MCP (~22 model calls/day for one JQL, slow, output needs parsing — violates "scripts for deterministic work"), (b) driving the OAuth'd Atlassian MCP from bare Node (fragile bridge against rotating OAuth state), or (c) Jira REST with a personal API token. The fix-round loop also needs a mechanical way to mark exhausted tickets `ai-blocked` (label + comment) without granting the agent Jira write tools.

ADR-006 counted "no new credentials created anywhere" as a consequence of local-only execution. The actual threat being killed there was **cloud-held write credentials** (a PAT in CI, a GitHub App). A user-scoped token that never leaves the owner's machine is a different animal.

## Decision
Use **Jira REST with a scoped personal API token** for all deterministic loop control:
- Stored ONLY on the owner's machine as env var `JIRA_API_TOKEN` (never committed, never synced, never passed to the agent's environment).
- Used exclusively by wrapper scripts (`scripts/lib/jira.mjs`): JQL search (poll), read labels, add `ai-blocked` label, add a blocked-summary comment, `GET /myself` health check.
- **Fail-closed:** any non-200 halts the loop (no retry storms, no degraded-auth runs).
- The AGENT keeps only its existing read-only Atlassian MCP tools; the token is not a tool the model can call.

## Consequences
- ✅ Polling is milliseconds and zero tokens; labeling/commenting on exhaustion needs no model and no new agent powers.
- ✅ Revocable in one click; user-scoped (can't do more than the owner can); local-only (the ADR-006 threat — cloud-held credentials — still doesn't exist).
- ⚠️ A real deviation from ADR-006's letter — recorded here deliberately rather than buried. The spirit (smallest external surface, no cloud credentials) holds.
- ⚠️ The token grants Jira write as the owner; mitigation: it is used only inside two wrapper functions (label, comment) whose inputs are wrapper-computed, never model text (the blocked-comment body is a mechanical summary of gate names + round count).
- 📌 Fallback if the owner ever revokes it: a `haiku`-model poll via MCP (allowlist = one search tool, `--max-turns 3`, output validated against `^UNP-\d+$`) behind the same `jira.mjs` interface — documented, not built.

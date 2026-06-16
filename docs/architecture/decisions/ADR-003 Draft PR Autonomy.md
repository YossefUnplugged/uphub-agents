---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-06-11
---

# ADR-003 — Autonomy ends at a draft PR; enforcement is platform-level

**Status:** Accepted · **Drives:** [[03 Target Architecture]], [[08 Security Model]]

## Context
A remote agent driven by ticket text holds write credentials in a repo that Jenkins deploys. Prompt-level rules ("never push main") are instructions to the component being attacked — fail-open by construction. This org's latest security ticket (UNP-8041: HMAC leak, fail-open WS auth) is the cautionary tale.

## Decision
The agent's terminal state is **always a draft PR + Jira → Waiting for CR**. Permanent human gates: PR review/merge (Ziv + Naama defaults); `plan-approved` label for > 4h or security-path tickets; transitions past Waiting for CR. Every prompt rule gets a **platform twin**: branch protection on `main`/`v*`, repo-scoped GitHub App with short-lived tokens (no PAT), actor allowlist on `@claude`, secret-scan on diff + PR body, diff-side security tripwire (security-sensitive paths without `plan-approved` ⇒ hard block).

## Consequences
- ✅ A fully compromised agent can at worst open a noisy draft PR — visible, reversible, unmerged.
- ✅ Reviewers' trust is earned by disclosure: PR body carries validator JSON, router-misses, omission warnings, rounds used.
- ⚠️ Slightly slower ship loop (human marks ready-for-review). Accepted deliberately — review rubber-stamping is the failure mode that turns all other controls off.

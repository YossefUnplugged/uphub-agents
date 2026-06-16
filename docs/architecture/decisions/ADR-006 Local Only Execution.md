---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-06-11
---

# ADR-006 — The agent runs ONLY on the owner's machine, at every stage

**Status:** Accepted (owner decision, 2026-06-11) · **Drives:** [[07 Remote Execution]], [[03 Target Architecture]], [[09 Roadmap]] Phase 2

## Context
The original design planned a remote execution path (GitHub Actions + `claude-code-action`, optionally cloud Routines) for Phases 2–3. The owner decided explicitly: **no remote execution at any stage** — the agent runs exclusively on his local machine.

## Decision
All pipeline stages — intake, execution, gates, closing — run on the owner's machine, in interactive Claude Code sessions or in scheduled headless runs (`Windows Task Scheduler → claude -p`). No GitHub Actions agents, no cloud Routines, no CI-hosted agents. Automation is achieved locally: the same Jira-polling triage logic (ADR-005's topology) executes as a local scheduled task using the credentials already on the machine (`gh` auth, Atlassian MCP OAuth).

## Consequences
- ✅ No new credentials created anywhere; smallest possible external surface; full hook support (route-on-touch works natively — GitHub Actions wouldn't have executed hooks at all).
- ✅ The repo-committed context (ADR-001) still pays off: teammates' machines, clean profiles, and the replay benchmark all read identical rules — and the design stays future-compatible if remote is ever revisited.
- ⚠️ The machine must be on for scheduled runs; tickets wait otherwise. Accepted for a "junior developer" cadence.
- ⚠️ The local agent acts with the owner's **full** credentials — broader than a scoped CI bot. The [[08 Security Model]] mitigations (spec extraction, diff-side tripwire, branch protection) remain mandatory, not optional.
- ⚠️ Bus factor 1 for automation (one machine). Acceptable now; revisit if the team wants shared autonomous capacity.
- 📌 [[decisions/ADR-005 Polling Over Dispatch]] is deferred (its polling topology survives in the local scheduler); the remote sections of [[07 Remote Execution]] become reference-only.

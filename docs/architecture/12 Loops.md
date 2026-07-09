---
tags: [agent-ecosystem]
updated: 2026-07-09
---

# 12 · Loops

> **TL;DR:** A loop is an agent repeating cycles of work until a stop condition is met. In uphub, **every loop is orchestrator-owned** ([[decisions/ADR-007 Loops Are Orchestrator-Owned]]): continuation, rounds, and stop evaluation are deterministic wrapper code; the evaluator is Gate A's **exit code**, never a model. Caps live in `config/loops.json`, never in prompts.

Based on the Claude Code team's loop taxonomy ("Getting started with loops", 2026-07-06), adapted to a containment architecture.

## Taxonomy → uphub

| Article loop | uphub equivalent | Loop controller | Stop condition | Status |
|---|---|---|---|---|
| **Turn-based** | Interactive dev sessions (skills = the verification step); each `claude -p` phase inside the pipeline is one "turn" verified by the wrapper's gate | Human / wrapper | Human satisfied / phase commits & exits | ✅ live |
| **Goal-based** (`/goal`) | **Fix-round loop** in `triage.mjs`: IMPLEMENT → Gate A → (RED → FIX → full Gate A)×N | `triage.mjs` | Gate A exit 0 · round cap (2 fix rounds) · non-retryable class | ✅ built (this phase) |
| **Time-based** (`/loop`, `/schedule`) | Task Scheduler tick → `triage-loop.ps1` (lock) → `triage-tick.mjs` (poll → dispatch) | Task Scheduler + tick script | Idle tick (no eligible ticket) · daily cap · quiet hours · pause file | 🔧 built, **NOT registered** (unattended gate below) |
| **Proactive** | Composition of all the above with zero real-time human | All of the above | Per-loop caps + permanent human gates (merge, Jira past Waiting-for-CR) | 🔜 gated on attended pilots |

Article guidance already embodied elsewhere: fresh-context reviewer = Gate B; "scripts for deterministic work" = the orchestrator, Gate A, the REST poll; "encode each failure into the system" = every incident becomes a mechanical rule.

## Stop-condition inventory (every loop, in one place)

| Loop | Cap / condition | Enforced by |
|---|---|---|
| Fix rounds per ticket | **2** (3 total gate attempts) | `config/loops.json` → `fixRounds.max`, counted in `triage.mjs` |
| Non-retryable failures | `tripwire`, `branch`, gate crash → **0 rounds**, BLOCKED immediately | failure classifier in `triage.mjs` |
| No-progress guard | fix round left HEAD unchanged → stop | HEAD compare in `triage.mjs` |
| Diff-growth guard | files-changed +>5 or insertions ×>2 vs pre-fix → runaway rewrite, BLOCKED | `git diff --shortstat` compare |
| Tickets per day (scheduled) | **3** (pilot: 1) | `poll.dailyTicketCap`, `state/daily-<date>.json` |
| Work per tick | **1 unit** (one ticket) | `triage-tick.mjs` |
| Ticket retry | a BLOCKED ticket is never auto-retried | `ai-blocked` label excluded by the poll JQL + `state/blocked.json` |
| Auth degraded | Jira `/myself` non-200 or `gh auth status` failing → halt + `state/ALERT-auth.txt` | tick auth gate, fail-closed |
| PR-feedback rounds | **3 per PR** (future — see Deferred) | `prFeedback.maxRoundsPerPr` |

## Config — `config/loops.json`
- `fixRounds`: `max`, `models` (round → model; `"inherit"` = the implement model), `maxTurnsCheap`/`maxTurnsDeep` (lint-class vs test-class failures), `diffGrowth` thresholds.
- `poll`: `intervalMinutes` (informational — the real interval is the Task Scheduler registration), `dailyTicketCap`.
- `prFeedback`: reserved for the deferred loop.

`state/` (gitignored) holds the ledgers: `daily-<date>.json`, `blocked.json`, `ALERT-*.txt`, `pause`.

## Model routing (article: "right model for the job")

| Phase | Model | Why |
|---|---|---|
| Poll / labeling / health / push | **none** (REST/gh in wrapper) | Deterministic work is scripts |
| IMPLEMENT | session default (strongest) | The only phase where capability buys quality |
| FIX round 1 | `sonnet` | Failures are localized + mechanically described |
| FIX round 2 | inherit implement model | Escalation ladder |
| CLOSE | session default (procedural; candidate for `sonnet` later) | Multi-step tool use, no design |

## Ops runbook
- **Pause everything:** create the file `state/pause` (any content). Delete to resume.
- **A ticket got `ai-blocked`:** inspect the kept worktree (path is in the Jira comment / console), fix or re-spec, remove the label, optionally clear it from `state/blocked.json`.
- **Raise the daily cap:** `config/loops.json` → `poll.dailyTicketCap` (start at 1 in pilot, raise on trust).
- **Auth alert:** `state/ALERT-auth.txt` exists → re-auth (`gh auth login` / new `JIRA_API_TOKEN`), delete the alert file.
- **Training trend:** `training/results/trend.jsonl` — one line per `--ledger` run; a task going green→red is a regression in OUR system (prompts/gates/skills), not the sandbox.
- **Run the training suite before committing agent-system changes** (`node training/run-training.mjs --all --ledger`) — the deliberate replacement for a nightly schedule (the suite's result only changes when we change the system; a nightly run would measure a constant — interval-matching per the article).

## The unattended gate (before ever registering the schedule)
1. Live one-shot smoke test passes on a real ticket (owner-attended).
2. ~5 attended `triage-tick.mjs` manual runs green (including idle ticks and an auth-down drill).
3. Pilot at `dailyTicketCap: 1`.
Only then: `install-scheduler.ps1` (remove its DISARMED guard as part of that deliberate step).

## Deferred (deliberately not built)
- **PR-feedback loop** — respond to review comments / CI failures on the agent's draft PRs. Highest blast radius (pushes to branches colleagues are reviewing; PR comments are an untrusted prompt-injection surface) and zero trigger population until real agent PRs exist. Design sketch: tick scans `gh pr list` (own draft PRs, `UNP-*` branches) → new comment ids / failing checks vs a `state/pr-feedback.json` ledger → isolated worktree on the PR branch → reduced-allowlist fix agent (NO gh, NO push — the **wrapper** pushes) → full Gate A → wrapper pushes + posts one summary comment → 3 rounds per PR, then `ai-blocked`. Build on demonstrated demand.
- **Nightly training schedule** — replaced by the pre-commit rule above.

Related: [[decisions/ADR-007 Loops Are Orchestrator-Owned]] · [[decisions/ADR-008 Mechanical Jira Access]] · [[08 Security Model]] · [[03 Target Architecture]]

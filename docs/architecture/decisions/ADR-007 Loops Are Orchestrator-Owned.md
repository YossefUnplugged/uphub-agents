---
tags: [agent-ecosystem, adr]
status: accepted
updated: 2026-07-09
---

# ADR-007 — Loops are orchestrator-owned; the evaluator is an exit code

**Status:** Accepted (owner approved, 2026-07-09) · **Drives:** [[12 Loops]], `scripts/triage.mjs` fix rounds, `scripts/triage-tick.mjs`

## Context
The Claude Code team's "Getting started with loops" article (2026-07-06) defines loops as *agents repeating cycles of work until a stop condition is met*, with four types: turn-based, goal-based (`/goal`), time-based (`/loop`, `/schedule`), and proactive. Its goal-based loop uses an **evaluator model** that checks the stop condition each time the agent tries to stop. uphub needed to adopt the loop patterns (fix rounds, scheduled triage, eventual PR feedback) without breaking its containment thesis: the agent must never own its own gates.

## Decision
Every loop in uphub lives in the **deterministic wrapper** (Node/PowerShell orchestrator), never in the agent:
- **Loop continuation, round counting, and stop evaluation are wrapper code.** The evaluator is a mechanical signal — Gate A's exit code, an HTTP status, a ledger counter — never a model, and never the acting agent.
- **All caps live in config (`config/loops.json`), not prompts.** The agent cannot raise its own round cap because the cap is not language — it's an integer the wrapper enforces.
- The article's in-session primitives (`/goal`, `/loop`, `/schedule`) are **deliberately not used** for the autonomous pipeline: our agents run headless (`claude -p`) inside orchestrator phases; the loop shell around them is ours.
- **Self-verification ≠ self-grading (owner decision 2026-07-09).** The agent SHOULD run the target's own checks inside its isolated worktree and iterate until they pass — the article's *inner* agentic loop (act → check → fix → repeat), and the allowlist grants the scoped check commands (nx/tsc/npm-script/node-test — never a general shell). What it may NOT do is *grade*: its green run is never the verdict, the wrapper re-runs the full gate, and the *outer* loop's continuation/stop remains exclusively wrapper-owned. This matches the article exactly — there too the stop condition is checked by an **external** evaluator with hard turn caps, never by the acting agent.
- Loop taxonomy mapping, per-loop stop conditions, and the ops runbook live in [[12 Loops]].

## Consequences
- ✅ A stop condition that is an exit code cannot be sweet-talked, reinterpreted, or "judged good enough" — strictly stronger than an evaluator model for an autonomous coding pipeline.
- ✅ Fix rounds ("goal-based") reuse the same constrained implement allowlist — loops add zero new agent powers.
- ✅ Token discipline falls out of the design: rounds are capped integers, deterministic steps (poll, label, push) are scripts with zero model tokens, model routing per phase is config.
- ⚠️ The wrapper carries more logic (classification, guards, ledgers) — it must stay small, readable, and tested (training-track task T4 exercises the fix-round loop live).
- ⚠️ Non-retryable failure classes must be explicit: a security-tripwire failure is never looped on (looping on it would train evasion); gate crashes and branch violations block immediately.

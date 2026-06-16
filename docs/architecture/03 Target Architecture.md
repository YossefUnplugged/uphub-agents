---
tags: [agent-ecosystem, architecture]
status: design
updated: 2026-06-11
---

# 03 Target Architecture

> **TL;DR:** One pipeline, three stages: intake (uphub) → execution (single agent + machine gates) → closing (draft PR + Jira). Interactive today, scheduled tomorrow — same context files, same gates, always on the owner's machine (ADR-006).

## The pipeline (interactive and scheduled runs share the SAME stages — all local, [[decisions/ADR-006 Local Only Execution]])

```
┌─────────── STAGE 1: INTAKE ───────────┐
│ Local:  /create-task-for-session-uphub │
│         (/task-intake for admin repo)  │
│ Scheduled: auto-triage (local headless │
│         run · label ai-ready · checklist)│
│ Output: structured task spec + branch  │
│         UNP-NNNN + Jira → In Progress  │
└────────────────┬───────────────────────┘
                 ▼
┌─────────── STAGE 2: EXECUTION ─────────┐
│ Single implementer agent               │
│  • context: L1→L4 from repo files      │
│  • skills:  route-on-touch (hook)      │
│  • writes code + tests together        │
│ Gate A: compliance-validator (script)  │
│  lint · tsc -b · tests · regexes ·     │
│  forbidden imports · omission detector │
│ Gate B: fresh-context review pass      │
│  /code-review + /security-review on    │
│  the diff only, results → PR body      │
└────────────────┬───────────────────────┘
                 ▼
┌─────────── STAGE 3: CLOSING ───────────┐
│ Local:  /create-pr-and-update-uphub    │
│ Scheduled: same steps, scripted via gh  │
│ Output: DRAFT PR + reviewers + Jira →  │
│ Waiting for CR + PR URL comment + @QA  │
└────────────────┬───────────────────────┘
                 ▼
   HUMANS: code review → merge (permanent gate)
   Jenkins CI → failure-classified feedback loop
   @claude PR comments → pr-feedback-responder
```

## Key structural decisions

1. **One implementer, not a 5-agent team, on the autonomous path.** Shared-types coupling in the Nx monorepo (`libs/admin-types` touched by most full-stack changes) makes parallel backend/frontend agents collide; determinism comes from context + gates, not from more agents. The agent team stays available **locally** as an opt-in mode for large tickets. [[decisions/ADR-004 Single Agent Remote]]
2. **Two gates, different epistemics.** Gate A is mechanical (exit codes — the model cannot argue with `tsc`). Gate B is a *fresh-context* skeptic that never saw the implementation reasoning, reading only the diff — the salvaged, sharpened essence of the old Reviewer teammate. Neither gate trusts the implementer's self-report.
3. **The terminal state is a draft PR.** Never a merge, never a push to `main`/`v*`, never a Jira transition past *Waiting for CR*. Enforced by branch protection on GitHub — which applies no matter where the agent runs — not by prompt. [[decisions/ADR-003 Draft PR Autonomy]] · [[08 Security Model]]
4. **Interactive and scheduled runs share one brain.** Both read the same committed `.claude/**` context and run the same validator script. The interactive flow keeps its AskUserQuestion gates; the scheduled flow replaces them with the readiness checklist + draft-PR + human review. No fork of truth.

## Data flow of a scheduled (autonomous) ticket — on the owner's machine

1. A scheduled local task (Windows Task Scheduler → headless `claude -p`) polls Jira (JQL: `project = UNP AND labels = ai-ready AND labels != ai-needs-info AND status = "To Do"`).
2. **Readiness checklist** (boolean, ALL must pass — see [[04 Agent Roster]] → remote-triage): ticket's repo onboarded ([[10 Ecosystem Map]])? acceptance criteria present? estimate set (≤ 4h proceeds directly; larger requires `plan-approved`)? QA assignee set? scope inferable? Any check fails → structured questions as a Jira comment + label `ai-needs-info` — excluded by the poll JQL, so the ticket isn't re-picked every 15 minutes; the reporter answers and removes the label to re-trigger (prior comments are read first — never re-asks answered questions). Exit without code.
3. Ready → extract a **structured task spec** (goal, acceptance criteria, files-in-scope hypothesis, out-of-scope flags). The spec is posted as a Jira comment (audit trail) and handed to the implementer as its prompt payload — the snapshot is what runs, not the live ticket. The implementer is never invoked on raw ticket prose ([[08 Security Model]]).
4. Branch `UNP-NNNN` → implement → Gate A → Gate B → draft PR (reviewers from org roster) → Jira transition + PR URL comment + @QA mention.
5. Jenkins reports status. Failure → classify: deterministic (compile/lint/repeatable test) ⇒ agent gets the log, max 2 fix rounds; infra/flake ⇒ retry build once, then label `ai-blocked` + human ping. The agent never "fixes" a flaky test by deleting it.
6. Review comments on agent PRs → the pr-feedback skill (run manually or on the local schedule) pulls them via `gh` and applies fixups (max 3 rounds, then `ai-blocked`).

## Failure-mode playbook

| Failure | Behavior |
|---|---|
| CI red on agent PR | Classify → deterministic: 2 fix rounds with log; infra: 1 build retry then `ai-blocked` + Jira comment. Branch always preserved. |
| Underspecified ticket | Questions as Jira comment + `ai-needs-info` (excluded from the poll JQL); reporter answers and removes the label to re-trigger; prior thread read first |
| Concurrent runs on one repo | Single-instance lock file for the scheduled runner (one autonomous run at a time; interactive sessions take precedence); branch-per-ticket isolates work |
| Stale L3/L4 generated docs | CI regenerate-and-diff → auto-fixup commit on the agent branch (not a hard red — avoids alert fatigue) |
| Cost runaway | `--max-turns` cap per invocation, nightly dispatch cap (N tickets), serial queue |
| Ticket asks for something suspicious | Diff-side security tripwire + spec extraction refuse-and-flag, see [[08 Security Model]] |

Related: [[04 Agent Roster]] · [[06 Skill Routing]] · [[07 Remote Execution]] · [[Pipeline Map.canvas|Pipeline Map]]

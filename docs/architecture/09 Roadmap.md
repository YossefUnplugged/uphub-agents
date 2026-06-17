---
tags: [agent-ecosystem, roadmap]
status: living
updated: 2026-06-11
---

# 09 Roadmap

> **TL;DR:** Three phases: 1) local hardening until a clean profile passes the replay benchmark, 2) local automation (pr-feedback first, then scheduled auto-triage on the owner's machine — ADR-006), 3) nightly autonomy with caps. Before everything — validate A1 with Ziv.

## Validate first (all Small — this week)

| # | Assumption | Risk | Validation | Fallback |
|---|---|---|---|---|
| **A1** | Head R&D (Ziv) approves committing `CLAUDE.md` + `.claude/` to the admin repo (gitignore surgery) | **Highest — everything downstream depends on it** | A 15-minute conversation with the diff in hand | `agents/claude/` non-ignored path + CI copy step, or sibling standards repo — written in [[05 Context Layers]] |
| A2 | A scheduled headless `claude -p` run on the owner's machine can use Atlassian MCP OAuth + `gh` auth non-interactively | Medium | 30-min spike: run one read-only triage from Task Scheduler | Run triage manually each morning instead of on a schedule |
| A3 | Jenkins runs on PR branches incl. drafts and posts commit statuses | Medium | 1-day spike: open a draft PR, watch statuses | Run validator-only in Actions as the merge signal |
| A4 | Jira REST with a service-account token covers transitions + comments headlessly | Low (curl uploads already work) | Create the Jira service account (owner: Yossef, approver: Ziv) + script the Waiting-for-CR transition once | — |

## Phase 1 — Local hardening (the determinism phase)

**Exit criterion (falsifiable):** the **replay benchmark** passes — 5–10 historical UNP tickets with known merged PRs (picked from recent sprints to cover backend-only, client-only, and full-stack-with-shared-types changes), re-run 2–3× each on a **clean Claude profile with zero plugins**, scored by the compliance-validator plus a short rubric judged by the Gate B review skill against the real merged PR (correct files touched incl. shared types, conventions followed, tests written). **≥80% of runs pass without human edits.** This doubles as a permanent regression suite for every future rules/skills change. No benchmark pass → no Phase 2 credentials. 

| # | Task | Effort | Depends on |
|---|---|---|---|
| 1.1 | A1 conversation → gitignore surgery + `.gitattributes` (LF) + commit root `CLAUDE.md`, split session state into `CLAUDE.local.md`, point the uphub intake skill at it | S | A1 |
| 1.2 | compliance-validator (`.claude/scripts/validate.mjs`) + local pre-PR wiring + `/create-pr-and-update-uphub` calls it | M | 1.1 |
| 1.3 | Dedupe per [[06 Skill Routing]]: move admin-* skills + rules + config into `admin/.claude/`, delete `admin-git`, strip lint-enforceable prose, plugin files become pointers | L | 1.1 |
| 1.4 | Route-on-touch hook + routing table + `paths.json` | M | 1.3 |
| 1.5 | context-harvester + generate L3 repo-map + L4 inventories + nested `CLAUDE.md` prose (backend / client / types) + staleness auto-fixup job | L | 1.1 |
| 1.6 | Replay benchmark harness + run → iterate rules until ≥80% | M | 1.2–1.5 |
| 1.7 | Jenkins spike (A3) | S | — |

## Phase 2 — Local automation (assisted, on the owner's machine — ADR-006)

| # | Task | Effort | Notes |
|---|---|---|---|
| 2.1 | Branch protection on `main`/`v*` + single-instance lock for scheduled runs | S | Platform guardrails first — [[08 Security Model]] |
| 2.2 | pr-feedback skill — pulls PR review comments via `gh`, applies fixups locally | S | Cheapest win; exercises the whole autonomous loop end-to-end |
| 2.3 | auto-triage: Task Scheduler → headless `claude -p` → Jira polling → readiness checklist → spec extraction → implement → Gate A → Gate B → **draft PR** → Jira + @QA | L | [[07 Remote Execution]] local-automation section |
| 2.4 | CI feedback loop with failure classification (deterministic vs flake), max 2 fix rounds | M | Needs 1.7 results |
| 2.5 | Secret-scan + security-tripwire steps in the validator (unconditional) | S | [[08 Security Model]] |

## Phase 3 — Scheduled autonomy

- Nightly triage run: score the `ai-ready` backlog, ask questions on underspecified tickets (stateful — reads comment threads), dispatch ≤ 3 implement runs per night initially, post a **morning summary** (Jira or Confluence): tickets attempted, PRs opened, blocked items, token spend.
- Requires the machine to be on overnight — if that's not acceptable, run the same triage as a morning batch instead.
- Onboard the Kotlin repos via the skeleton in [[05 Context Layers]] — their `CODE_STYLE.md` becomes L2, Gradle module graph becomes L3.

## Permanent human gates (never automated)

1. **PR review + merge** — always human (org policy: Ziv + Naama default reviewers).
2. **`plan-approved` label** for tickets > 4h estimate or touching security paths — agent posts its plan as a Jira comment and waits.
3. **Jira transitions past Waiting for CR** — human/QA only.
4. **`ai-ready` labeling** — a human decides what the agent may attempt.

## Sequence summary

```
Week 1:  A1–A4 validation + 1.1 + 1.7 Jenkins spike
Weeks 2–4:  1.2 → 1.3 → 1.4 → 1.5 (parallelizable after 1.3)
Week 5:  1.6 benchmark loop
Week 6:  2.1 + 2.2 (pr-feedback live)
Weeks 7–9:  2.3 + 2.4 + 2.5 (auto-triage live, assisted)
Then:    Phase 3 when two weeks of Phase-2 PRs needed no ai-blocked rescue
```

Related: [[00 uphub - Agent Overview]] · [[04 Agent Roster]] · all [[decisions/ADR-001 Repo Over Plugin|ADRs]]

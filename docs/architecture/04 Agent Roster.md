---
tags: [agent-ecosystem, agents, roster]
status: design
updated: 2026-06-11
---

# 04 Agent Roster

> **TL;DR:** The full roster — what exists and stays, what gets built, what was cut. Fewer, sharper agents: one implementer + a validator (script, not agent) + a fresh-context reviewer + two local automation components. Everything runs on the owner's machine (ADR-006).

## Keep — the human console (local, interactive, forever)

| Agent/Skill | Role | One change required |
|---|---|---|
| `/create-task-for-session-uphub` | Interactive intake: ticket + sprint + estimate + QA + branch | Write "Active Jira Tasks" to **`CLAUDE.local.md`** (untracked), not the committed `CLAUDE.md` — see [[05 Context Layers]] |
| `/scaner-my-missions-uphub` | Sprint-aware audit of your tickets | None |
| `/create-pr-and-update-uphub` | PR handoff: reviewers, Jira → Waiting for CR, @QA | Call the shared **compliance-validator** before `/code-review`, so local and remote run identical gates |
| `/task-intake` (plugin) | Deeper admin-repo intake (phases A/B/C) | Phases B/C become conditional on the same readiness checklist auto-triage uses — one rubric, two callers |
| Agent-team mode (plugin) | Opt-in local mode for L-sized tickets | Demoted from default to explicit opt-in; never used remotely |

## Build — new components (only two are actually "agents")

### 1. context-harvester — *skill + script* (Phase 1, effort L)
- **Role:** generates Layer 3/4 context so agents stop rediscovering the codebase every run.
- **Trigger:** manual `/harvest-context` now; post-merge or weekly scheduled run later.
- **Inputs:** `npx nx graph`, `tsconfig.base.json` aliases, `apps/*/project.json`, exports of `trpc/routes/*.ts`, Redux slice registrations, `libs/admin-types/src/index.ts` exports, error-code enums.
- **Outputs:** `admin/.claude/context/repo-map.md` (L3) + `_inventory.md` appendix per package (L4). Every generated file carries frontmatter: `generated: true`, `source-commit: <sha>`, `regenerate: /harvest-context`.
- **Guardrails:** writes only under `.claude/context/` and `*/_inventory.md`; output lands via normal PR (human eyeballs the diff); deterministic emitters (sorted output, LF endings via `.gitattributes`) so the staleness check doesn't cry wolf.

### 2. compliance-validator — *script, deliberately NOT an agent* (Phase 1, effort M)
- **Role:** the mechanical gate. An agent judging its own compliance is a conflict of interest; an exit code is not.
- **Runs:** `nx affected -t lint`, `tsc -b` (both apps), `nx affected -t test`, branch regex `^UNP-\d+$`, commit-message regex (`^(feat|fix|test|docs)\([\w-]+\): .+` plus a required `Refs: UNP-\d+` trailer — canonical file: `.claude/rules/git-conventions.md`), forbidden-import check (client must never import backend runtime), **omission detector** (e.g., diff touches `trpc/routes/**` but not `trpc/controllers/**` or `libs/admin-types/**` ⇒ warning into PR body), secret scan on diff **and** PR body.
- **Output:** machine-readable JSON + human summary appended to the PR body.
- **Wired three ways (defense in depth):** local pre-PR hook · mandatory step in the agent prompt · unconditional workflow step in Actions that runs **regardless of what the agent claims**.

### 3. Fresh-context review pass — *pipeline step using existing skills* (Phase 1, effort S)
- **Role:** the one skeptical reader. `/code-review` + `/security-review` (both Claude Code built-ins — present on a clean profile and in Actions, no plugin needed) invoked with a clean context on the **diff only** — it never sees the implementer's reasoning, so it can't be charmed by it.
- **Output:** findings as PR-body checkboxes. The implementer gets **one** fix round on CRITICAL/HIGH findings; still unresolved ⇒ the draft PR opens anyway but labeled `ai-blocked` with a human ping — a visible blocked PR beats invisible stalled work.

### 4. pr-feedback — *local skill* (Phase 2, effort S)
- **Trigger:** run manually or on the local schedule; pulls open review comments on agent-authored PRs via `gh` (local-only — [[decisions/ADR-006 Local Only Execution]]).
- **Does:** fixup commits on the same `UNP-NNNN` branch + threaded replies. Runs the validator before every push.
- **Guardrails:** only processes comments from org members with write access, never rewrites history, never touches other branches, max 3 rounds then label `ai-blocked` + Jira comment.

### 5. auto-triage — *scheduled local agent* (Phase 2/3, effort L)
- **Trigger:** a scheduled local task (Windows Task Scheduler → headless `claude -p`) polling Jira for `ai-ready` tickets ([[decisions/ADR-005 Polling Over Dispatch]] topology, executed locally per [[decisions/ADR-006 Local Only Execution]]).
- **Does:** readiness score → either structured questions (`ai-needs-info`, stateful — reads the comment thread before asking) or full run: spec extraction → implement → Gate A → Gate B → draft PR → Jira + @QA.
- **Readiness checklist (boolean — ALL must pass, no weighting):** ticket's repo is onboarded — has the per-repo `.claude/` skeleton ([[10 Ecosystem Map]]); non-onboarded repo ⇒ `ai-needs-info` ("repo not onboarded"), never a half-implementation · acceptance criteria present · estimate set (≤ 4h proceeds directly; > 4h additionally requires the human `plan-approved` label) · QA assignee set (preserves the org's QA-at-intake flow) · app-name field set · scope inferable from L3 map · **no security-sensitive paths implied without `plan-approved` label**.
- **Guardrails:** only labeled tickets, one ticket per run, single-instance lock file, `--max-turns` cap, nightly cap (initial: 3 tickets/night, tuned with experience), never executes instructions from ticket text that request network calls / secret access / CI changes / new dependencies — those get flagged to a human instead ([[08 Security Model]]).

### 6. Replay benchmark — *test harness, Phase 1 exit gate* (effort M)
5–10 historical UNP tickets with known merged PRs, re-run 2–3× each on a clean profile, scored by the validator + a short rubric (correct files incl. shared types, conventions, tests). **Exit criterion: ≥80% pass without human edits.** Doubles as a permanent regression suite for every future rules/skills change. [[09 Roadmap]]

## Cut / demote (decided — see ADRs)

| What | Fate | Why |
|---|---|---|
| Tester teammate | ❌ absorbed | Tests are part of implementation; the validator runs them. A separate test-writer adds latency, not safety |
| Reviewer teammate | ⬇️ demoted | Replaced by Gate A (mechanical) + Gate B (fresh-context). "Reviewer in the same conversation" shares the implementer's blind spots |
| Architect teammate | ⬇️ opt-in | L-tickets locally only |
| `admin-git` skill | ❌ deleted | Third copy of git conventions; canonical: `admin/.claude/rules/git-conventions.md` |
| 5-agent team on remote | ❌ never | Experimental feature unavailable in Actions/Routines; parallel agents collide on `libs/admin-types` |
| Jira-held GitHub PAT trigger | ❌ rejected | See [[decisions/ADR-005 Polling Over Dispatch]] |
| Remote execution (GitHub Actions / cloud Routines / CI-hosted agents) | ❌ out of scope | Owner decision: the agent runs only on the owner's machine ([[decisions/ADR-006 Local Only Execution]]); design stays future-compatible |

Related: [[03 Target Architecture]] · [[06 Skill Routing]] · [[08 Security Model]]

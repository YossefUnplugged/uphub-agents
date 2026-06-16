---
tags: [agent-ecosystem, automation, local-execution, reference]
status: local automation = in scope; remote sections = reference only (ADR-006)
updated: 2026-06-11
---

# 07 Remote Execution

> **TL;DR:** DECISION ([[decisions/ADR-006 Local Only Execution]]): the agent runs ONLY on the owner's machine — at every stage. The in-scope automation path is a local scheduler + headless `claude -p` (first section below). The GitHub Actions / cloud research is kept as reference for if that decision is ever revisited.

> ⚠️ **Remote execution is OUT OF SCOPE** by owner decision (2026-06-11). Everything from "The three execution paths" downward is research reference, **not planned work**.

## Local automation — the in-scope path

- **Trigger:** Windows Task Scheduler (or a manual run) launches headless `claude -p` on the owner's machine, working directory = the repo clone.
- **Auth:** everything already on the machine — `gh` CLI auth for GitHub, Atlassian MCP OAuth for Jira. **No new credentials are created anywhere.**
- **Constraint flags:** `--permission-mode` + `--allowedTools` keep the headless run tighter than an interactive one; `--max-turns` caps cost per run.
- **Concurrency:** a single-instance lock file — one autonomous run at a time; the scheduled task skips if the lock is held (interactive sessions take precedence).
- **Hooks DO run locally** — route-on-touch and the validator wiring work exactly as designed. (This was the weak point of GitHub Actions, which does not execute hooks — local-only actually *strengthens* the routing design.)
- **Limitation to accept:** the machine must be on; if it sleeps, tickets wait until the next run. Acceptable for a "junior developer" cadence.
- **What still lives on GitHub regardless:** branch protection on `main`/`v*` (protects against any pusher) and Jenkins CI — both apply to agent-authored branches exactly as to human ones.

---

# Reference: remote execution research (out of scope)

## The three execution paths (verified against docs, mid-2026)

| Capability | GitHub Actions (`anthropics/claude-code-action@v1`) | Cloud Routines (claude.ai/code) | Headless `claude -p` / Agent SDK (Jenkins) |
|---|---|---|---|
| Repo `.claude/` + CLAUDE.md auto-load | ✅ | ✅ (fresh clone) | ✅ |
| Plugins auto-load | ❌ (explicit `plugins:` input only) | ❌ | ✅ (machine-local) |
| Hooks execute | ❌ | ❌ | ✅ |
| Trigger: webhook/mention | ✅ @claude, workflow_dispatch, schedule | API-fire endpoint, GitHub webhook, cron | ❌ (wrap in CI job) |
| PR-native integration | ✅ best | ⚠️ session URL only | ⚠️ manual |
| Cost model | GH minutes + API tokens | ~$0.08/hr runtime + tokens, daily run caps | API tokens + own infra |
| Best for | **The implementer + responder** | Scheduled read-mostly triage/reports | Deep custom orchestration if ever needed |

**Decision: GitHub Actions is the primary remote path.** It's the only one with first-class PR integration, and repo-committed `.claude/` (see [[05 Context Layers]]) makes it deterministic. Hooks not executing in Actions means route-on-touch needs the hook configured via repo `.claude/settings.json` — verify during the Phase-2 spike; fallback is the same table enforced as a mandatory prompt step + validator audit. Routines are optional later for a nightly read-only backlog report. Jenkins-headless stays a documented fallback (it's the one path where hooks fully run).

## Trigger topology — polling, not dispatch

Rejected: Jira Automation holding a GitHub PAT to fire `repository_dispatch` (credential in the wrong store, user-bound, org-wide blast radius). Adopted: **a scheduled workflow polls Jira** with a Jira API token held in GitHub secrets — one credential, in the better store, no GitHub-write capability living inside Atlassian. Latency (≤15 min) is irrelevant for a "remote junior." [[decisions/ADR-005 Polling Over Dispatch]]

```yaml
# .github/workflows/ai-triage.yml  (sketch — final version lives in the repo)
name: AI ticket triage
on:
  schedule: [{ cron: "*/15 6-18 * * 0-4" }]   # work hours, Sun-Thu
  workflow_dispatch: {}                        # manual kick for testing
concurrency: { group: ai-implementer, cancel-in-progress: false }
permissions: { contents: write, pull-requests: write }
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }               # nx affected needs full history
      - name: Find ai-ready ticket
        run: |                                  # JQL via Jira REST, JIRA_API_TOKEN secret
          # project = UNP AND labels = ai-ready AND labels != ai-needs-info AND status = "To Do" ORDER BY priority
          # → exports TICKET_KEY / exits 0-with-skip if none
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ steps.app-token.outputs.token }}   # GitHub App, NOT a PAT
          prompt: |
            Run the remote-triage protocol from .claude/rules/workflow.md
            for ticket ${TICKET_KEY}. Terminal state: draft PR. Never merge.
          claude_args: "--max-turns 30"
```

```yaml
# .github/workflows/claude-pr-responder.yml  (Phase 2 first win)
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
# job gate: comment contains '@claude' AND author_association in (OWNER, MEMBER, COLLABORATOR)
```

## Auth model

| Credential | Where | Scope |
|---|---|---|
| `ANTHROPIC_API_KEY` | GitHub secrets | API only |
| **GitHub App** installation token | generated per-run (`actions/create-github-app-token`) | `contents:write`, `pull_requests:write`, **this repo only**, short-lived |
| `JIRA_API_TOKEN` (+ service-account email) | GitHub secrets | `read:jira-work`, `write:jira-work` — transitions, comments, attachments via REST (the curl pattern the plugin already uses) |
| Atlassian MCP OAuth | **local only** — never in CI | interactive sessions |

## CI feedback loop (Jenkins)

Phase-1 spike (1 day, do **before** building anything on top): verify the Jenkinsfile runs on PR branches, runs on **draft** PRs, and posts commit statuses to GitHub reliably. Then:

1. Status failure on an agent branch → **classify** the failure first.
2. Deterministic (compile error, lint, repeatably failing test) → re-invoke agent with the log, max 2 rounds.
3. Infra/timeout/flake → retry the build once → still red ⇒ label `ai-blocked` + Jira comment + human ping. **The agent never sees flake logs** — agents "fix" flaky tests by weakening them.
4. Authority split, explicit: **validate.mjs is authoritative for agent-fixable failures; Jenkins is authoritative for merge-readiness.** Disagreement ⇒ human.

## Operational caps

`--max-turns` per invocation · nightly ticket cap · repo-wide serial concurrency group initially (split per-concern when the responder starts queueing behind long implement runs) · per-week token budget review in the morning summary.

Related: [[03 Target Architecture]] · [[08 Security Model]] · [[09 Roadmap]]

# uphub-agents

**An autonomous "junior developer" for Unplugged.** Label a Jira ticket `ai-ready`, and an agent — running locally on your machine — picks it up, writes standards-compliant code, runs the quality gates, and opens a **draft PR**. A human always reviews and merges.

```
 Jira ticket (label: ai-ready, assigned to you)
        │
        ▼
  ┌─────────────────────────── the agent (local) ───────────────────────────┐
  │  scan → readiness → spec → implement (Opus coord + Sonnet sub-agents)    │
  │  → Gate A (lint/types/tests) → Gate B (fresh-context review) → draft PR  │
  └──────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  Draft PR + Jira → Waiting for CR        (a human reviews & merges — always)
```

> Determinism doesn't come from a bigger prompt — it comes from **layered context + machine-checked gates**. Full design: [`docs/architecture/00 Home.md`](docs/architecture/00%20Home.md).

---

## How it's organized — CORE + pluggable NICHE profiles

The repo is built like a puzzle: a **universal core** that never changes, plus **per-niche profiles** you swap to point the agent at a new codebase (admin front+back today; Java / Android tomorrow). See [`docs/architecture/11 Profiles and Niches.md`](docs/architecture/11%20Profiles%20and%20Niches.md).

```
uphub-agents/
├── prompts/
│   └── triage.md            # CORE · the pipeline the agent runs end-to-end
├── standards/               # CORE · org-wide rules (identical for every niche)
│   ├── git.md               #   branch/commit conventions
│   ├── jira.md              #   labels, transitions, mandatory fields, poll JQL
│   ├── internal-access.md   #   reaching IP-restricted resources (gh/browser/escalate)
│   ├── aaa-permissions.md   #   registering permissions via up-aaa-sync
│   └── design.md            #   how to do UI/design work (match the app, full CRUD)
├── scripts/                 # CORE · the machinery
│   ├── setup.mjs            #   ★ one-time interactive setup (run this first)
│   ├── validate.mjs         #   Gate A — lint/types/tests/regex/imports
│   ├── sync-target.mjs      #   stamp context into a target repo's .claude/
│   ├── harvest-context.mjs  #   generate L3 (repo map) + L4 (per-package inventory)
│   ├── run-headless.ps1     #   run the agent once (manual trigger)
│   ├── triage-loop.ps1      #   scheduled loop (single-instance lock)
│   └── install-scheduler.ps1#   register the loop in Windows Task Scheduler
├── skills/                  # NICHE · domain skills (admin-* = the admin niche)
│   ├── admin-api-design/ … admin-testing/   #   tRPC/React/Redux/MUI patterns
│   └── unplugged-design/    #   brand/design layer (optional, per niche)
├── rules/
│   └── routing.json         # NICHE · path-glob → skill (route-on-touch)
├── hooks/
│   └── route-on-touch.mjs   # CORE mechanism · injects the right skill on file edit
├── config/
│   ├── targets.json         # NICHE · each target repo: path, checks, conventions
│   ├── browser.example.json #   template (your real browser.json is gitignored)
│   └── local.json           #   (gitignored) your machine config — made by setup
├── benchmark/               # the Phase-1 determinism gate (replay historical tickets)
└── docs/architecture/       # the full design: 11 notes + 6 ADRs + canvas
```

**To add a new niche** (e.g. a Java service): keep `prompts/` + `standards/` + `scripts/`, and add a profile — new `skills/`, a `routing.json`, a `config/targets.json` entry, and the niche's check commands. Core is untouched.

---

## Prerequisites

- **Node.js 18+**
- **Claude Code CLI** (`claude`)
- **GitHub CLI** (`gh`) — authenticated (`gh auth login`)
- **Atlassian MCP** connected in Claude Code (for Jira) — OAuth
- **Chrome + the Claude extension** — for internal IP-restricted resources (swagger, etc.)
- Network access to your target repo + its **AAA database** (for `up-aaa-sync`)

---

## Installation

```bash
# 1. Clone
git clone https://github.com/YossefUnplugged/uphub-agents.git
cd uphub-agents

# 2. Register the AAA-permission-sync MCP (once per machine)
claude mcp add up-aaa-sync -s user -- npx -p up-aaa-sync up-aaa-sync-mcp

# 3. One-time setup — interactive. Asks for: target repo + path, Jira, GitHub,
#    code reviewer(s), QA tester, browser account, and how often it runs.
#    Writes config/local.json + config/browser.json (both gitignored).
node scripts/setup.mjs

# 4. Tell up-aaa-sync about the target (creates .aaa.config.json there — fill in the AAA DB creds)
npx up-aaa-sync init <path-to-your-target-repo>

# 5. Sync the agent's context into the target repo's (gitignored, local) .claude/
node scripts/sync-target.mjs --target admin

# 6. Generate the L3/L4 code context for the target
node scripts/harvest-context.mjs --target admin
```

That's the one-time install. Nothing is committed to the target repo — all synced context lives in its **gitignored `.claude/`**.

---

## Usage

**Mark a ticket for the agent:** in Jira, add the label **`ai-ready`** to a ticket **assigned to you** (double gate — it only ever touches your own `ai-ready` tickets).

**Run it:**
```bash
# Once, now (manual trigger — recommended while you build trust)
pwsh scripts/run-headless.ps1

# Or install the scheduled loop (unattended, every 30 min, work hours)
pwsh scripts/install-scheduler.ps1 -IntervalMinutes 30
# remove with:  pwsh scripts/install-scheduler.ps1 -Uninstall
```

The agent stops at a **draft PR** + transitions the ticket to *Waiting for CR* and @-mentions QA. You review and merge.

**Check quality / determinism** before trusting it broadly:
```bash
node scripts/validate.mjs --target admin            # Gate A on the current branch
node benchmark/run.mjs --target admin --dry-run     # replay-benchmark wiring
```

---

## Safety (always on)

- **Never touches production:** works only on a branch named after the ticket; never pushes to `main`/`v*`; terminal state is always a **draft PR**.
- **Never guesses:** if it lacks an API contract, permission name, or config, it **stops and asks** — it does not invent.
- **Human gates stay human:** code review, merge, the `plan-approved` label, and `ai-ready` labelling are always a person's decision.
- **Local-only:** runs on your machine with your existing `gh` + MCP auth — no new credentials created.

---

## Learn more
- The full design & decisions: [`docs/architecture/00 Home.md`](docs/architecture/00%20Home.md)
- Why a separate repo + how niches replicate: [`docs/architecture/11 Profiles and Niches.md`](docs/architecture/11%20Profiles%20and%20Niches.md)
- The pipeline the agent runs: [`prompts/triage.md`](prompts/triage.md)

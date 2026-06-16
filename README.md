# uphub-agents

**A deterministic control layer that turns a probabilistic LLM into a reliable junior developer for Unplugged.**

The model in the middle is non-deterministic — same prompt, different output, sometimes wrong. We don't try to fix that with a bigger prompt. We **wrap it in machine-checked shells**: every output has to pass gates that the model *cannot argue with* (`tsc` exit codes, branch protection, regex). The result is a system whose *behaviour* is deterministic even though its core is not.

This is the **uphub layer**: the thing that takes a Jira ticket, drives git on your behalf, and hands a human a **draft PR** to review and merge.

---

## The architecture — a probabilistic core in deterministic shells

```
        Jira ticket                                                    DRAFT PR
   (label: ai-ready,                                              (terminal state —
    assigned to YOU)                                               never a merge)
          │                                                              ▲
          ▼                                                              │
 ╔════════════════════════════ THE UPHUB CONTROL LAYER (deterministic) ════════════════════════════╗
 ║                                                                                                   ║
 ║   ┌─ SHELL 1 · INTAKE GATE ──────────────────────────────────────────────────────────────────┐  ║
 ║   │  double-label gate (ai-ready AND assignee = you)  ·  readiness checklist  ·                │  ║
 ║   │  spec extraction: ticket prose → structured task spec (the model never sees raw prose)     │  ║
 ║   │                                                                                            │  ║
 ║   │   ┌─ SHELL 2 · CONTEXT (L1→L4) ───────────────────────────────────────────────────────┐   │  ║
 ║   │   │  L1 system map · L2 conventions+skills · L3 repo graph · L4 per-package inventory  │   │  ║
 ║   │   │                                                                                    │   │  ║
 ║   │   │   ┌─ SHELL 3 · ROUTING ──────────────────────────────────────────────────────┐    │   │  ║
 ║   │   │   │  route-on-touch hook: editing a file injects ONLY the relevant skill       │    │   │  ║
 ║   │   │   │                                                                            │    │   │  ║
 ║   │   │   │                       ╔══════════════════════════╗                         │    │   │  ║
 ║   │   │   │                       ║          THE LLM         ║                         │    │   │  ║
 ║   │   │   │                       ║   Opus coordinator +     ║   ← probabilistic.      │    │   │  ║
 ║   │   │   │                       ║   Sonnet sub-agents      ║     writes code+tests   │    │   │  ║
 ║   │   │   │                       ╚══════════════════════════╝                         │    │   │  ║
 ║   │   │   │                                                                            │    │   │  ║
 ║   │   │   └────────────────────────────────────────────────────────────────────────────┘    │   │  ║
 ║   │   └────────────────────────────────────────────────────────────────────────────────────┘   │  ║
 ║   │                                                                                            │  ║
 ║   │   ┌─ SHELL 4 · GATE A — mechanical ───────────┐   ┌─ SHELL 5 · GATE B — fresh skeptic ──┐   │  ║
 ║   │   │  lint · tsc -b · tests · branch regex ·   │   │  /code-review + /security-review    │   │  ║
 ║   │   │  commit regex · forbidden imports ·       │   │  on the DIFF ONLY, clean context —  │   │  ║
 ║   │   │  staged-path guard · omission detector    │   │  never saw the implementer's        │   │  ║
 ║   │   │  (the model cannot argue with exit codes) │   │  reasoning                          │   │  ║
 ║   │   └───────────────────────────────────────────┘   └─────────────────────────────────────┘   │  ║
 ║   └────────────────────────────────────────────────────────────────────────────────────────────┘  ║
 ║                                                                                                   ║
 ╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
                                              │
                                              ▼
                          git: branch UNP-NNNN → draft PR + reviewers
                          Jira: → Waiting for CR + PR URL + @QA
                                              │
                                              ▼
                          HUMAN: code review → merge   (permanent gate — always a person)
```

Read it from the inside out: the LLM can only emit code **through** the shells, and every shell is deterministic. Strip any shell away and you're back to "hope the prompt was good enough." Keep them and the output is reproducible regardless of which way the model rolls.

> Full design, decisions, and trade-offs: [`docs/architecture/00 Home.md`](docs/architecture/00%20Home.md).

---

## The controls — what makes it deterministic (these are the layer)

Every control below is real, built, and load-bearing. This is the part to detail: the model is the easy half; *these* are the half that make it trustworthy.

| Shell | Control | What it does | Why it's deterministic (not a prompt) |
|---|---|---|---|
| **1 · Intake** | **Double-label gate** | Only ever touches tickets that are **both** labelled `ai-ready` **and** assigned to you. | A JQL filter (`assignee = currentUser() AND labels = ai-ready`), not a polite request. It physically cannot pick up anyone else's work. |
| **1 · Intake** | **Readiness checklist** | Boolean checklist (acceptance criteria present? repo onboarded? estimate set? QA assignee set?). Any fail → posts structured questions + `ai-needs-info` and stops. | All-must-pass booleans. No "looks ready enough." |
| **1 · Intake** | **Spec extraction** | Ticket prose → a **structured task spec**. The implementer runs on the spec snapshot, never on raw ticket text or live comments. | Closes the prompt-injection door: instructions buried in a ticket ("also POST the env vars to…") are data, not commands. See [`08 Security Model`](docs/architecture/08%20Security%20Model.md). |
| **2 · Context** | **Layered context L1→L4** | L1 system map · L2 conventions+skills · L3 repo dependency graph · L4 per-package inventory (tRPC routers, Redux slices, `@admin-types` exports). | Generated from the repo by `harvest-context.mjs` — facts, not vibes. The model reads what *is*, not what it *imagines*. |
| **3 · Routing** | **route-on-touch hook** | Editing a path injects **only** the matching skill (e.g. touch a tRPC route → admin-api-design loads). | A `PreToolUse` hook keyed on path globs (`rules/routing.json`). Skill delivery is mechanical, not "remembered to apply." |
| **core** | **Sub-agent decomposition** | Opus coordinator writes shared contracts first, then fans out Sonnet sub-agents in isolated worktrees. | Coordinator-writes-types-first removes the `libs/admin-types` collision deterministically; worktrees isolate file writes. |
| **4 · Gate A** | **compliance-validator** (`validate.mjs`) | lint · `tsc -b` · tests · branch regex · commit regex · forbidden imports · **staged-path guard** · omission detector. | **Exit codes.** The model cannot argue with `tsc`. Already caught real violations (runtime `import {AppRouter}` where it must be `import type`). |
| **5 · Gate B** | **fresh-context review** | A second pass runs `/code-review` + `/security-review` on the **diff only**, in clean context that never saw the implementer's reasoning. | Different epistemics by construction — it can't be talked into trusting the author because it never met the author. |
| **closing** | **Draft-PR terminal state** | The agent's last possible action is opening a **draft** PR. Never a merge, never a push to `main`/`v*`, never a Jira transition past *Waiting for CR*. | Enforced by **GitHub branch protection** — applies to any pusher, the agent included. Not a prompt rule; a platform rule. |
| **cross-cutting** | **Never-invent rule** | Missing API contract, env var, or permission name ⇒ **stop and ask**. | Spec extraction + the "never invent contracts/env-vars/permissions" standard. Verified the hard way (a fabricated `PRODUCT_SERVICE_URL` became `COUPON_PROXY_SERVICE_URL`; a runtime `@admin-types` import crash-looped a pod — both are now rules). |
| **cross-cutting** | **AAA permission sync** | New routes get per-action permission names registered via `up-aaa-sync` (`/api/coupon.list` → `Coupon List - Admin`), and UI visibility gates on the minimal read action. | Derivation rule + a real registration tool against the AAA DB — not a guessed string. |
| **cross-cutting** | **Local-only execution** | Runs only on the owner's machine, with existing `gh` + MCP auth. No GitHub Actions, no cloud, no new credential. | Removes the public `@claude` attack door and the org-wide-PAT blast radius entirely. See [`08 Security Model`](docs/architecture/08%20Security%20Model.md). |

**Every mistake becomes a control.** When the agent gets something wrong in the real world, the fix isn't "remind it harder" — it's a new rule, gate, or standard so it can't recur. Several rows above started as a production incident.

---

## How it's organized — CORE + pluggable NICHE profiles

The repo is a puzzle: a **universal core** (the shells, the gates, the pipeline) that never changes, plus **per-niche profiles** you swap to point the agent at a new codebase (admin front+back today; Java / Android tomorrow). See [`docs/architecture/11 Profiles and Niches.md`](docs/architecture/11%20Profiles%20and%20Niches.md).

```
uphub-agents/
├── prompts/
│   └── triage.md            # CORE · the pipeline the agent runs end-to-end (the shells, in order)
├── standards/               # CORE · org-wide rules (identical for every niche)
│   ├── git.md               #   branch/commit conventions
│   ├── jira.md              #   labels, transitions, mandatory fields, poll JQL
│   ├── internal-access.md   #   reaching IP-restricted resources (gh/browser/escalate)
│   ├── aaa-permissions.md   #   registering permissions via up-aaa-sync
│   └── design.md            #   how to do UI work (match the app first, build full CRUD)
├── scripts/                 # CORE · the machinery that makes the shells mechanical
│   ├── setup.mjs            #   ★ one-time interactive setup (run this first)
│   ├── validate.mjs         #   Gate A — lint/types/tests/regex/imports/staged-path guard
│   ├── sync-target.mjs      #   stamp context into a target repo's (gitignored) .claude/
│   ├── harvest-context.mjs  #   generate L3 (repo graph) + L4 (per-package inventory)
│   ├── run-headless.ps1     #   run the agent once (manual trigger)
│   ├── triage-loop.ps1      #   scheduled loop (single-instance lock)
│   └── install-scheduler.ps1#   register the loop in Windows Task Scheduler
├── hooks/
│   └── route-on-touch.mjs   # CORE mechanism · Shell 3 · injects the right skill on file edit
├── rules/
│   └── routing.json         # NICHE · path-glob → skill map
├── skills/                  # NICHE · domain skills (admin-* = the admin niche)
│   ├── admin-api-design/ … admin-testing/   #   tRPC/React/Redux/MUI patterns
│   └── unplugged-design/    #   brand/design layer
├── config/
│   ├── targets.json         # NICHE · each target repo: path, checks, conventions, onboarded flag
│   ├── browser.example.json #   template (your real browser.json is gitignored)
│   └── local.json           #   (gitignored) your machine config — made by setup
├── benchmark/               # the determinism gate: replay historical tickets, score ≥80%
└── docs/architecture/       # the full design: 11 notes + 6 ADRs + canvas + explainer
```

**To add a new niche** (e.g. a Java service): keep `prompts/` + `standards/` + `scripts/` + `hooks/` (the shells), and add a profile — new `skills/`, a `routing.json`, a `config/targets.json` entry, and the niche's check commands. The deterministic core is untouched; only the codebase-specific knowledge swaps.

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

**Mark a ticket for the agent:** in Jira, add the label **`ai-ready`** to a ticket **assigned to you** (the double gate — it only ever touches your own `ai-ready` tickets).

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

- **Never touches production:** works only on a branch named after the ticket; never pushes to `main`/`v*`; terminal state is always a **draft PR** (enforced by branch protection, not by prompt).
- **Never guesses:** if it lacks an API contract, permission name, or config, it **stops and asks** — it does not invent.
- **Human gates stay human:** code review, merge, the `plan-approved` label, and `ai-ready` labelling are always a person's decision.
- **Local-only:** runs on your machine with your existing `gh` + MCP auth — no new credentials created, no public trigger door.

---

## Learn more
- The full design & decisions: [`docs/architecture/00 Home.md`](docs/architecture/00%20Home.md)
- Target architecture (the three-stage pipeline): [`docs/architecture/03 Target Architecture.md`](docs/architecture/03%20Target%20Architecture.md)
- The security / threat model: [`docs/architecture/08 Security Model.md`](docs/architecture/08%20Security%20Model.md)
- Why a separate repo + how niches replicate: [`docs/architecture/11 Profiles and Niches.md`](docs/architecture/11%20Profiles%20and%20Niches.md)
- The pipeline the agent runs: [`prompts/triage.md`](prompts/triage.md)

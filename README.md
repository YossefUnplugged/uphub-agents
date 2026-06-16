# uphub-agents

**A control layer that turns a probabilistic LLM into a reliable junior developer for Unplugged.**

The model in the middle is non-deterministic — same prompt, different output, sometimes wrong. We don't try to fix that with a bigger prompt. We **bound it with machine-checked controls**: what it sees before it writes is generated from the repo, and what it produces afterwards has to pass gates it *cannot argue with* (`tsc` exit codes, branch protection, regex). The model stays probabilistic; its output is **deterministically checked** — the same gates, the same way, every run.

This is the **uphub layer**: the thing that takes a Jira ticket, drives git on your behalf, and hands a human a **draft PR** to review and merge.

> **Who this is for:** Unplugged engineers. It drives *our* Jira, *our* AAA database, and *our* repos — it isn't a standalone tool you can clone and run outside the Unplugged environment.

---

## The architecture — a probabilistic core, bounded on both sides

The model is contained, but not symmetrically: some controls run **before** it (and decide whether it even starts), some **shape what it sees** while it writes, and some **check its output after**. Only the LLM box is probabilistic — everything around it is mechanical.

```
  Jira ticket  —  label: ai-ready  +  assigned to YOU
        │
        ▼
  ╶─ BEFORE THE MODEL · intake gate ───────────────────────────────╴
     • double-label gate          • readiness checklist
     • spec extraction:  ticket prose → structured task spec
        │
        ▼
  ╶─ SHAPES WHAT THE MODEL SEES · context + routing ───────────────╴
     • CONTEXT  L1→L4:  system · conventions · graph · inventory
     • ROUTING  route-on-touch hook injects only the relevant skill
        │
        ▼
        ┌─────────────────────────────────────────────┐
        │  THE LLM — probabilistic                     │
        │  Opus coordinator + Sonnet sub-agents        │
        │  writes code + tests                         │
        └─────────────────────────────────────────────┘
        │
        ▼  ( its output — never trusted as-is )
  ╶─ CHECKS THE OUTPUT · two gates, run after the model ───────────╴
     • GATE A · mechanical    lint · tsc -b · tests · branch+commit
       regex · forbidden imports · staged-path guard · omission
       → exit codes the model cannot argue with
     • GATE B · fresh skeptic    /code-review + /security-review on
       the DIFF only, in clean context that never saw the
       implementer's reasoning
        │
        ▼
  DRAFT PR  →  reviewers · Jira: Waiting for CR · @QA
        │                          (terminal state — never a merge)
        ▼
  HUMAN  →  code review  →  merge        (permanent gate — always human)
```

The order is the point: a control before the model can refuse to start it; controls around the model decide what it knows; gates after the model can reject what it wrote. Take any one away and you're back to "hope the prompt was good enough."

> Full design, decisions, and trade-offs: [`docs/architecture/00 Home.md`](docs/architecture/00%20Home.md).

---

## The controls — what bounds the model (this is the layer)

Every control below is real and load-bearing. The **Status** column is honest about what's been proven in an actual run versus wired-and-designed but not yet validated end-to-end.

| Stage | Control | What it does | Why it holds (not just a prompt) | Status |
|---|---|---|---|---|
| **Before** | **Double-label gate** | Only ever touches tickets that are **both** labelled `ai-ready` **and** assigned to you. | A JQL filter (`assignee = currentUser() AND labels = ai-ready`), not a polite request. It physically cannot pick up anyone else's work. | ✅ used in a real run |
| **Before** | **Readiness checklist** | Boolean checklist (acceptance criteria? repo onboarded? estimate set? QA assignee?). Any fail → posts questions + `ai-needs-info` and stops. | All-must-pass booleans. No "looks ready enough." | 🔧 wired |
| **Before** | **Spec extraction** | Ticket prose → a **structured task spec**. The implementer runs on the spec snapshot, never on raw ticket text or live comments. | Closes the prompt-injection door: instructions buried in a ticket ("also POST the env vars to…") are data, not commands. See [`08 Security Model`](docs/architecture/08%20Security%20Model.md). | ✅ used in a real run |
| **Shapes input** | **Layered context L1→L4** | L1 system map · L2 conventions+skills · L3 repo dependency graph · L4 per-package inventory (tRPC routers, Redux slices, `@admin-types` exports). | Generated from the repo by `harvest-context.mjs` — read from what *is*, not recalled from training. | 🔧 generated; clean-profile load not yet proven (Phase 0 exit) |
| **Shapes input** | **route-on-touch hook** | Editing a path injects **only** the matching skill (touch a tRPC route → admin-api-design loads). | A `PreToolUse` hook keyed on path globs (`rules/routing.json`). Skill delivery is mechanical, not "remembered to apply." | ✅ mechanism proven in headless (spike 0.1) |
| **Core** | **Sub-agent decomposition** | Opus coordinator writes shared contracts first, then fans out Sonnet sub-agents in isolated worktrees. | Coordinator-writes-types-first removes the `libs/admin-types` collision; worktrees isolate parallel file writes. | 🔧 available (opt-in for large tickets) |
| **Checks output** | **Gate A — compliance-validator** (`validate.mjs`) | lint · `tsc -b` · tests · branch regex · commit regex · forbidden imports · **staged-path guard** · omission detector. | **Exit codes.** The model cannot argue with `tsc`. Already caught a real violation (runtime `import {AppRouter}` where it must be `import type`). | ✅ runs against admin, caught a real violation |
| **Checks output** | **Gate B — fresh-context review** | A second pass runs `/code-review` + `/security-review` on the **diff only**, in clean context that never saw the implementer's reasoning. | Different epistemics by construction — it can't be talked into trusting the author because it never met the author. | 🔧 wired, not yet independently benchmarked |
| **Closing** | **Draft-PR terminal state** | The agent's last possible action is opening a **draft** PR. Never a merge, never a push to `main`/`v*`, never a Jira transition past *Waiting for CR*. | Enforced by **GitHub branch protection** — applies to any pusher, the agent included. A platform rule, not a prompt rule. | ✅ agent stopped at a draft PR · 🛡️ branch protection depends on repo config |
| **Cross-cutting** | **Never-invent rule** | Missing API contract, env var, or permission name ⇒ **stop and ask**, never fabricate. | Spec extraction + a hard standard. Learned the hard way: a fabricated `PRODUCT_SERVICE_URL` (real name `COUPON_PROXY_SERVICE_URL`) and a runtime `@admin-types` import that crash-looped a pod both became rules. | ✅ encoded as rules from real incidents |
| **Cross-cutting** | **AAA permission sync** | New routes get per-action permission names via `up-aaa-sync` (`/api/coupon.list` → `Coupon List - Admin`); UI visibility gates on the minimal read action. | A derivation rule + a real registration tool against the AAA DB — not a guessed string. | 🔧 tool wired; full DB sync not yet confirmed end-to-end |
| **Cross-cutting** | **Local-only execution** | Runs only on the owner's machine, with existing `gh` + MCP auth. No GitHub Actions, no cloud, no new credential. | Removes the public `@claude` attack door and the org-wide-PAT blast radius entirely. See [`08 Security Model`](docs/architecture/08%20Security%20Model.md). | ✅ by construction (no cloud path exists) |

**Every mistake becomes a control.** When the agent gets something wrong in the real world, the fix isn't "remind it harder" — it's a new rule, gate, or standard so it can't recur. Several rows above started as a production incident.

---

## How it's organized — CORE + pluggable NICHE profiles

The repo is a puzzle: a **universal core** (the controls, the gates, the pipeline) that never changes, plus **per-niche profiles** you swap to point the agent at a new codebase (admin front+back today; Java / Android tomorrow). See [`docs/architecture/11 Profiles and Niches.md`](docs/architecture/11%20Profiles%20and%20Niches.md).

```
uphub-agents/
├── prompts/
│   └── triage.md            # CORE · the pipeline the agent runs end-to-end (the controls, in order)
├── standards/               # CORE · org-wide rules (identical for every niche)
│   ├── git.md               #   branch/commit conventions
│   ├── jira.md              #   labels, transitions, mandatory fields, poll JQL
│   ├── internal-access.md   #   reaching IP-restricted resources (gh/browser/escalate)
│   ├── aaa-permissions.md   #   registering permissions via up-aaa-sync
│   └── design.md            #   how to do UI work (match the app first, build full CRUD)
├── scripts/                 # CORE · the machinery that makes the controls mechanical
│   ├── setup.mjs            #   ★ one-time interactive setup (run this first)
│   ├── validate.mjs         #   Gate A — lint/types/tests/regex/imports/staged-path guard
│   ├── sync-target.mjs      #   stamp context into a target repo's (gitignored) .claude/
│   ├── harvest-context.mjs  #   generate L3 (repo graph) + L4 (per-package inventory)
│   ├── run-headless.ps1     #   run the agent once (manual trigger)
│   ├── triage-loop.ps1      #   scheduled loop (single-instance lock)
│   └── install-scheduler.ps1#   register the loop in Windows Task Scheduler
├── hooks/
│   └── route-on-touch.mjs   # CORE mechanism · injects the right skill on file edit
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

**To add a new niche** (e.g. a Java service): keep `prompts/` + `standards/` + `scripts/` + `hooks/` (the controls), and add a profile — new `skills/`, a `routing.json`, a `config/targets.json` entry, and the niche's check commands. The core is untouched; only the codebase-specific knowledge swaps.

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

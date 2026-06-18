# Level 3 — live clean-profile benchmark (the proof)

The exit gate that turns *"I think the agent is deterministic"* into *"I proved it."* Runs the
agent **for real** on historical tickets, on a **clean Claude profile** (no plugins — only the
synced `admin/.claude/` context), and scores each run against the merged-PR ground truth.

**Pass bar:** ≥ 80% of runs pass without human edits (see `benchmark/rubric.md`).

> This is a **user-run gate**: it needs a live `claude -p` (your auth/model), a clean profile,
> and a working `admin` checkout (lint/tsc/test). It cannot run in the agent sandbox.

---

## Prerequisites (once)
- `admin` repo at `C:/Users/YossefBenHaim/Desktop/admin` (see `config/targets.json`).
- `gh` authenticated (the harness fetches each ground-truth PR). ✅ verified working.
- `node` available. ✅
- This repo (`uphub-agents`) is the source of the scripts.

---

## Steps (in order)

```bash
cd C:/Users/YossefBenHaim/Desktop/unplugged-agent-system

# 1. Generate L3/L4 context INTO admin (repo-map + nested CLAUDE.md inventories).
#    Without this the clean profile has no package context — the test would be unfair.
node scripts/harvest-context.mjs --target admin

# 2. Stamp skills + routing + hook + settings into admin/.claude (settings.local.json untouched).
#    Run --dry-run first to preview (16 files: 13 skills + routing.json + route-on-touch.mjs + settings.json).
node scripts/sync-target.mjs --target admin --dry-run
node scripts/sync-target.mjs --target admin

# 3. Make sure admin can build — Gate A runs lint / tsc / test.
cd ../admin && npm install && cd ../unplugged-agent-system

# 4. THE RUN — one case first, on a clean profile (empty config dir = no plugins).
#    Bash:
CLAUDE_CONFIG_DIR=/c/Users/YossefBenHaim/.claude-clean node benchmark/run.mjs --target admin --live --case UNP-6841
#    PowerShell:
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-clean"; node benchmark/run.mjs --target admin --live --case UNP-6841

# 5. If the single case passes, run the full set (drop --case) and read the % gate.
node benchmark/run.mjs --target admin --live
```

What step 4 does per case: checkout the PR base → run the implementer headless on the ticket
prompt → `validate.mjs` (Gate A) → diff touched-vs-ground-truth files → score per rubric.

---

## Clean profile — the mechanism
"Clean" = a Claude install with **no plugins** (so the only context is the synced `admin/.claude/`).
- **Primary:** point `CLAUDE_CONFIG_DIR` at an **empty** directory. Plugins + user settings live in
  the config dir, so an empty one = clean. Project `.claude/` is still loaded from the `admin` cwd.
- **Verify it's clean (run once):**
  ```bash
  CLAUDE_CONFIG_DIR=/c/Users/YossefBenHaim/.claude-clean claude --version   # should run; creates the dir
  ```
  Then in that profile a session in `admin` should have the `admin-*` skills (from the synced
  `.claude/skills`) but **none** of the `admin-development-assistant` plugin skills.
- **Alternative** (this Claude version, 2.1.x, also supports): isolate plugins explicitly via the
  CLI flags `--plugin-dir` / `--settings` / `--strict-mcp-config`. The env-dir approach is simplest.

---

## What success / failure tells you
- **≥80% pass** → determinism is real, not tied to one machine's plugin. Proceed to Phase 2.
- **A case fails** → the output is gold: read *why* (Gate A red? wrong files? type duplicated?).
  Each failure points at a missing skill, a routing gap, or thin L3/L4 context — fix that, re-run.
  The benchmark doubles as a **regression suite** for every future change.

## Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| `gh` errors fetching a PR | auth / IP allow-list | `gh auth status`; run from the permitted network |
| Gate A red on lint only | `admin` deps not installed | `npm install` in admin (step 3) |
| Agent has plugin skills in the run | profile not clean | confirm `CLAUDE_CONFIG_DIR` points at an empty dir |
| Nested `CLAUDE.md` shows as staged | harvest output must not be committed | `validate.mjs` staged-guard blocks it — leave them unstaged |

---

## Verified during prep (agent side)
- ✅ `sync-target --dry-run` → 16 files to `admin/.claude`, `settings.local.json` untouched.
- ✅ `harvest-context --target admin` usage confirmed (L3 `repo-map.md` + L4 nested CLAUDE.md).
- ✅ benchmark dry-run green (cases load, ground-truth PRs reachable via `gh`).
- ✅ rubric discrimination check passed (UNP-6841: real PR = PASS, deliberately-wrong = FAIL).
- ⏳ Remaining = this live run (yours).

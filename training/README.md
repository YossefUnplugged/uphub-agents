# Training track — exercise the full pipeline on synthetic tasks

A safe way to run the **whole route end-to-end** and iterate on the agent, its skills, and its gates —
**without** touching real Jira tickets or the developer's admin checkout.

It is a *training/exercise* ground, not the historical-PR benchmark:
- **benchmark/** = *proof* — replay real merged PRs, score against ground truth (are we deterministic?).
- **training/** = *practice* — throwaway tasks with known-good outcomes we can run over and over while we
  change skills/prompts/gates and watch the route behave.

## What it exercises (and the P0 patterns it proves safely)
Each task runs the real pipeline against a disposable sandbox, demonstrating two fixes the production
path still needs (P0 #2, #3) — here they are proven with zero risk:
1. **Isolated git worktree** per task — never a real repo, never the dev's working copy.
2. **The wrapper runs Gate A, not the agent** — the agent only implements + commits; `run-training.mjs`
   runs `validate.mjs` itself, so the pass/fail is trustworthy (the agent can't grade itself).

## The sandbox
`training/sandbox-seed/` is a tiny **dependency-free** Node ESM project (no `npm install`): a `mathUtils`
module, a `node --test` suite, and stand-in `typecheck`/`lint` tools. `setup-sandbox.mjs` copies it to
`training/.sandbox/` (gitignored) and `git init`s it with a baseline that has **one deliberate bug**.

## Tasks (`training/tasks/*.json`)
| id | kind | what it checks |
|----|------|----------------|
| **T1-fix-subtract** | bug fix (smoke) | the agent MUST fix an obvious bug so the existing tests pass — if T1 fails, the route is broken |
| **T2-add-multiply** | feature | implement + export `multiply`; scored by a **hidden** acceptance test the agent never sees (no gaming with a weak self-test) |
| **T3-negative-control** | nothing to do | `add` is already correct — PASS requires the agent to make **no** src change (catches "invents work when there is none") |

## Run it
```bash
node training/setup-sandbox.mjs                         # one time (or --force to rebuild)
node training/run-training.mjs --task T1-fix-subtract   # one task
node training/run-training.mjs --all                    # every task
node training/run-training.mjs --task T2-add-multiply --keep   # keep the worktree to inspect
```
Each run writes a ledger to `training/results/<timestamp>/<task>.json` (+ `.diff`) with the Gate A
detail, the agent's diff, duration, and PASS/FAIL — the audit trail the benchmark was missing.

## Add a task
Drop a JSON in `training/tasks/` (`id`, `branch` matching `^task-[a-z0-9-]+$`, `prompt`, optional
`hiddenTest` path, optional `negativeControl: true`). Keep tasks small and outcome-checkable.

# Replay benchmark rubric

The Phase-1 exit gate. Re-run historical UNP tickets (known merged PRs) on a **clean Claude profile** (no plugins — only the synced `admin/.claude/` context) and score each run. **Exit: ≥80% of runs pass without human edits.**

Each run is scored on 5 criteria. A run **passes** only if Gate A is green AND it scores ≥ 4/5 (and never violates a "hard" criterion).

| # | Criterion | How measured | Hard? |
|---|---|---|---|
| 1 | **Gate A green** | `validate.mjs` exit 0 (lint, typecheck, test, branch, commit, imports, staged) | **HARD** — fail ⇒ run fails |
| 2 | **Right files touched** | Set overlap between the agent's changed files and the merged PR's files (`gh pr view <n> --json files`). ≥ 70% precision+recall. | no |
| 3 | **Shared-types respected** | If the merged PR changed `libs/admin-types`, the agent did too (didn't duplicate a type locally). | **HARD** when applicable |
| 4 | **Conventions** | Spot-check: arrow components, double quotes, 4-space, Zod inputs, typed TRPCError, `import type` for `@admin-backend`. (Mostly covered by Gate A lint, this catches the rest.) | no |
| 5 | **No scope creep** | Agent didn't touch files unrelated to the ticket (no edits outside the ground-truth neighbourhood beyond reasonable). | no |

## Discrimination check (do this BEFORE scaling to 10 cases)
Hand-score ONE case two ways: (a) the actual merged PR, (b) a deliberately wrong solution (e.g. type duplicated in the client). The rubric MUST score (a) pass and (b) fail. If it can't tell them apart, the rubric is theater — fix it before trusting the benchmark.

## Notes
- "Clean profile" = a Claude profile with **no plugins installed**, so the only context is the synced `admin/.claude/` (skills, hooks, routing, generated L3/L4). This is what proves determinism doesn't depend on one machine's plugin.
- The benchmark doubles as a **regression suite**: re-run it after any change to skills/rules/context to confirm quality didn't drop.

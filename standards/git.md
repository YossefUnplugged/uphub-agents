# Git standards (org-level, canonical)

These are the rules `validate.mjs` enforces for agent-authored work. Aligned to the team's **actual** practice (verified from `admin` git log), not aspiration.

## Branch
- Branch name MUST equal the ticket id exactly: `^UNP-\d+$` (e.g. `UNP-8041`). No `feature/` prefix, no description suffix.

## Commit message
- Conventional-commit subject: `<type>(<scope>): <description>` where type ∈ `feat|fix|test|docs|chore|refactor|perf|style|build|ci`.
- The UNP id appears in the message — the team's real convention is **trailing parens in the subject**: `fix(security): harden webhook (UNP-8041)`.
  - NOT a `Refs: UNP-NNNN` trailer (that was an aspirational convention in the ada plugin that the team never adopted — `validate.mjs` was corrected to match reality).
- Commit after each meaningful unit; don't batch unrelated changes.

## Staging discipline (critical for the agent)
- Stage explicitly: `git add <task files>`. **Never `git add -A`.**
- Generated/context files must NEVER be committed: `.claude/**`, any `**/CLAUDE.md`, `**/_inventory.md`. (`validate.mjs` `staged` check fails the gate if they are staged — nested `CLAUDE.md` is not gitignored, so this guard is the safety net.)

## PR
- Terminal state is always a **draft PR**. The agent never merges, never pushes to `main`/`v*`, never force-pushes (branch protection on GitHub enforces this regardless of where the agent runs).
- Windows-safe creation: `gh pr create --draft --body-file <tempfile> --reviewer <csv>` (never heredoc).

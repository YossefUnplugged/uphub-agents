# Fix round (Gate A failed — targeted repair only)

You are in an isolated git worktree on branch `{{BRANCH}}` for ticket `{{TICKET}}`. Your earlier implementation FAILED the mechanical compliance gate (Gate A). This is fix round {{ROUND}} of {{MAX_ROUNDS}} — a bounded loop controlled by the orchestrator, not by you.

## The failing checks (fix ONLY these)

{{FAILURES}}

## Current change surface (for orientation)

```
{{DIFF_STAT}}
```

## Rules — read carefully

1. **Fix ONLY the reported failures.** No new features, no refactors, no "while I'm here" improvements, no new files unless a failure explicitly requires one.
2. **Do NOT touch security-sensitive paths** (auth / webhook / websocket / server middleware). If a failure seems to require changing one, STOP without committing — the orchestrator will block and a human will take over.
3. Inspect the code with Read/Grep as needed; the failure details above are the gate's exact output.
4. Do NOT run lint/typecheck/tests yourself, do NOT push, do NOT open a PR — the orchestrator re-runs the FULL gate after you commit.
5. When done: stage explicitly (`git add <files>`, never `-A`) and make ONE commit with a conventional subject referencing the ticket, e.g. `fix({{TICKET_SCOPE}}): address Gate A failures ({{TICKET}})`. The commit-format check applies to YOUR commit too.
6. If you genuinely cannot fix a failure (missing information, contradictory requirement), commit nothing and STOP — an unchanged tree tells the orchestrator to halt the loop and surface it to a human. Never fabricate a fix.

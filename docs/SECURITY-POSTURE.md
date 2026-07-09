# Security posture — claimed vs. real (verified 2026-07-08)

An honest accounting of what the containment layer **actually enforces today**, versus what the
README and `08 Security Model` describe. Written so no one — us or a colleague reading the shared
README — mistakes a *designed* control for a *live* one. Every row was checked against the files in
this repo and the synced `admin/.claude/` on this machine, not against the docs.

The guiding principle still holds: **the allowlist is the real gate.** A control that a tool in the
allowlist can trivially bypass is not a control. Several "controls" in the docs are exactly that.

## The gaps

| # | Doc claim | Reality (verified) | Severity |
|---|-----------|--------------------|----------|
| 1 | "`.env` / secrets are **deny-read**" — README access-restriction row (status 🔧 "wired"), `08 Security Model` §"Don't read secrets" | **No deny-read exists.** `admin/.claude/settings.local.json`'s `deny` list is destructive-command only (`rm`, `git reset --hard`, `DROP`, …) — nothing about reading files. `Read` is allowed unrestricted, and even a `Read`-deny would be bypassed by `Bash(node *)`, `Bash(npx *)`, or the browser `javascript_tool` — all in the run-headless allowlist. | **High** (false claim in a shared doc) |
| 2 | Diff-side **security tripwire** — `08 Security Model` §"Detection" | **BUILT (2026-07-09).** Now a real `tripwire` check in `validate.mjs`: the diff is matched against `config/targets.json` → `securityPaths` (auth/webhook/WS/middleware, verified present); a hit without `--plan-approved` is a HARD BLOCK (fail-closed). Config lives in targets.json, not the aspirational `.claude/config/paths.json` the docs named. ~~vapor~~ → resolved. | ~~High~~ closed |
| 3 | **Secret-scan** on diff + PR body — `ADR-003`, `08 Security Model` | **Not built.** No secret-scan in `validate.mjs` or anywhere in the pipeline. | Medium |
| 4 | "Never a merge, never a push to `main`/`v*`" framed as enforced | Only **branch protection** enforces this, and it is repo-config-dependent + **unverified**. The agent's allowlist includes `Bash(gh *)` and `Bash(git *)`, so it *can* call `gh pr merge` / `git push` — nothing local stops it. README's closing row honestly hedges ("🛡️ depends on repo config"); other prose does not. | **High** (the no-merge guarantee rests entirely on one unverified platform setting) |
| 5 | (undocumented) | The allowlist grants `mcp__claude-in-chrome__javascript_tool` + `navigate` + `read_network_requests` — **arbitrary JS execution and network access in a browser**. This is a large exfiltration/action surface that the security model does not mention at all. | Medium |
| 6 | The agent "can't grade itself / can't bypass its gate" (implied by Gate A/B design) | Until the training-track port lands, the production path lets the agent **edit `validate.mjs`, run its own gate, and push** — `Edit`/`Write` + `Bash(node/git *)` are all allowed in the same session. (Proven-safe pattern now exists in `training/`; production port is P0 #2/#3, pending owner approval.) | **High** |

## Self-verification trade-off (owner decision 2026-07-09)

Adopting the loops article's inner agentic loop, the implement/fix phases may now RUN the target's
check commands (`npx nx`, `npx tsc`, `npm run`, `node --test`, `node tools/*`) in the isolated worktree.
**Be honest about what that grants:** running tests *is* executing code the agent wrote — check-running
is arbitrary local code execution by construction (a test file can read any file the owner's account can,
or make network calls). No command-scoping changes that. What still contains it: the worktree carries no
`.env` (gitignored, never copied); the phase still has no push/gh/merge/Jira-write tools; the spec-extraction
firewall treats ticket text as data; Gate B security-reviews the diff; the terminal state is a draft PR a
human reads. Residual risk accepted by the owner in exchange for the article-level self-sharpening loop
(fewer expensive outer fix rounds, verified handoffs).

## What that means

The honest one-liner: **containment today = the allowlist + (unverified) branch protection.** Everything
else in the security section — deny-read, the diff tripwire, secret-scan — is *design intent, not
enforcement*. The allowlist is genuinely load-bearing and real; the "defense in depth" around it is
mostly still on paper.

## Fixes — split by risk (so the owner can decide the drastic ones)

**Safe to do now (docs honesty, this repo, no behaviour change):**
- ✅ *(done in this pass)* Correct the README access-restriction row so it no longer claims deny-read is wired.
- Reconcile `08 Security Model` + `ADR-003`: mark tripwire / secret-scan / deny-read as **Roadmap, not live** (tracked under docs task #10 to avoid churning the Obsidian vault mid-session).

**Drastic — needs owner approval (changes the autonomous agent's capabilities; P0 #2/#3/#8):**
- Move Gate A out of the agent's session (wrapper runs it; drop `Edit`/`Write` access to `validate.mjs`). — #2
- Run triage in an isolated worktree, not the dev checkout. — #3
- Drop `Bash(gh *)` merge verbs and tighten `Bash(git *)` (no `push` to protected refs) from the allowlist; verify branch protection actually exists on `main`/`v*`. — #8 *(partly done: `triage.mjs`'s implement phase has no gh/push, and its close phase excludes `gh pr merge`/`gh pr ready`. Still open: verify branch protection on the platform.)*
- Decide the browser surface — #8 *(mostly done: `triage.mjs`'s implement allowlist DROPS `javascript_tool` (the arbitrary-JS / POST-anywhere exfil surface flagged in row 5) and keeps only read tools — navigate / get_page_text / read_page / read_network_requests — for fetching real API contracts. Open: whether `read_network_requests` can also go.)*
- ✅ **DONE (2026-07-09):** the diff-side tripwire is built — `validate.mjs` `tripwire` check + `config/targets.json` `securityPaths`, fail-closed on security-path diffs without `--plan-approved`. Verified: fail (no approval) / warn (approved) / pass (non-security).

None of the "safe" items change what the agent can do; all of the "drastic" items do, which is why they
wait for the owner.

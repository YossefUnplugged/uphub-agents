---
tags: [agent-ecosystem, context, four-layers]
status: design
updated: 2026-06-11
source-of-truth-when-built: admin/.claude/** and admin/CLAUDE.md
---

# 05 Context Layers

> **TL;DR:** Where each layer lives as a file. The critical finding: admin's `.gitignore` currently blocks `.claude/` and `docs/` — until that opens, no clean checkout sees any context. This is the first and riskiest step (A1).

## Placement map — every layer, one canonical file

| Layer | Artifact | Location | Authored by |
|---|---|---|---|
| **L1** system overview | `CLAUDE.md` (committed): architecture, commands, conventions summary — the current file *minus* session state | `admin/` root | hand-written |
| L1 session state | `CLAUDE.local.md` (untracked by convention): "Active Jira Tasks" block; the uphub intake skill writes **here** from now on | `admin/` root | uphub skill |
| **L2** conventions | `git-conventions.md`, `code-style.md`, `workflow.md` — imported from CLAUDE.md | `admin/.claude/rules/` | hand-written, single source |
| L2 router | `skill-routing.md` + the route-on-touch hook config | `admin/.claude/rules/` + `.claude/settings.json` | hand-written — [[06 Skill Routing]] |
| L2 pattern skills | `admin-api-design`, `admin-components`, … (deduplicated, granular — see [[06 Skill Routing]]) | `admin/.claude/skills/` (moved from plugin) | hand-written |
| **L3** monorepo map | `repo-map.md`: nx project graph, path aliases, targets, ports, module boundaries, "what a change here affects" | `admin/.claude/context/` | **generated** (context-harvester) |
| L3 path config | `paths.json`: the path globs skills/router reference — change the repo layout, change one file | `admin/.claude/config/` | hand-written |
| **L4** package context | `apps/admin_backend/CLAUDE.md`, `apps/admin_client/CLAUDE.md`, `libs/admin-types/CLAUDE.md`: stable prose (middleware chain, provider stack, "RabbitMQ is non-fatal"-class facts) | nested per package | hand-written |
| L4 inventories | `_inventory.md` appendix per package: tRPC router list, Redux slice shapes, shared hooks, error codes, exported types | next to each nested CLAUDE.md | **generated** (context-harvester) |
| Machine config | `jira.json` (field IDs, app mappings — **no secrets**), `reviewers.json` → long-term the org roster stays canonical in `uphub-skills/config.json` | `admin/.claude/config/` | copied; plugin reads the repo copy |
| Headless profile | a section in committed context: what does NOT work outside the owner's interactive session (nginx assumptions, interactive auth flows) — written for headless scheduled runs and the replay benchmark | `admin/.claude/rules/ci-profile.md` | hand-written |

## The blocking prerequisite — A1 gitignore surgery

`admin/.gitignore` currently ignores `.claude/` and `docs/`; `CLAUDE.md` is untracked. Required change (needs Head-R&D buy-in — the **single riskiest assumption** in this design):

```gitignore
# remove:  .claude/  docs/  CLAUDE.md-ignoring patterns
# add instead:
.claude/settings.local.json
.claude/worktrees/
CLAUDE.local.md
```

Plus `.gitattributes` forcing `* text=auto eol=lf` for `.claude/**` and generated files — Windows devs commit CRLF, Linux CI regenerates LF; without this the staleness check produces permanent phantom diffs.

**Fallback if A1 is refused** (write it down so it's a plan, not a panic): keep `.claude/` ignored, commit the same tree under a non-ignored path (e.g., `agents/claude/`) and have CI copy it to `.claude/` at checkout — uglier, works. Second fallback: a separate `unplugged-claude-standards` repo checked out as a sibling in CI. Both preserve [[decisions/ADR-001 Repo Over Plugin]] in spirit: rules travel with git, not with a laptop.

## What stays in the plugin (the "operator console")

Interactive intake UX (AskUserQuestion flows), Out-GridView reviewer picker, Figma MCP, sounds, agent-team mode, Obsidian vault. Everything execution-critical leaves. Plugin files that duplicated rules become one-line pointers to the repo canonical.

## Multi-repo strategy (Kotlin repos later)

- Org-stable rules (UNP branch regex, commit format, Jira workflow, reviewer roster) are **template-managed**: canonical templates live in `uphub-skills`; a sync tool stamps them into each repo between `<!-- managed:start -->` / `<!-- managed:end -->` markers and **opens a drift PR** (never pushes directly, never touches content outside markers — repo-specific adaptations live outside the managed blocks).
- Each repo's skeleton: root `CLAUDE.md` + `.claude/rules/` + `.claude/config/` + (where applicable) generated context. The Kotlin repos' existing `CODE_STYLE.md` content becomes their L2; a harvester variant reads the Gradle module graph for their L3.
- Onboarding order follows admin's service neighbors ([[10 Ecosystem Map]]): `up_draft_server` (TS), `up_npm_aaa`/`up_npm_aaa_sdk` (TS), `up_vpn_admin` (Java), `up_apk_parser` (Java) — then the UP-Life Kotlin repos. The language→toolchain table in the Ecosystem Map defines each repo's validator commands.
- **Not now:** a marketplace-plugin distribution mechanism. Two repos don't amortize it; revisit at four.

## Staleness contract for generated context

The staleness check runs wherever the validator runs (local pre-PR hook in Phase 1, an Actions step in Phase 2): regenerate L3/L4 and diff. Non-empty diff ⇒ **auto-fixup commit on the agent's branch** (visible in review), not a hard red — deterministic emitters (sorted, LF) keep noise at zero; a hard-fail variant can be revisited once the check has been quiet for a month. Stale context that agents *trust* is worse than no context, which is why the check exists at all.

Related: [[01 Vision and Methodology]] · [[06 Skill Routing]] · [[decisions/ADR-001 Repo Over Plugin]]

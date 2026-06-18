---
tags: [agent-ecosystem, schema, meta]
status: built
updated: 2026-06-18
---

# _SCHEMA — how this vault is structured and maintained

> The **schema** layer of the llm-wiki pattern (Karpathy's `llm-wiki`): the config that lets any model maintain this vault deterministically. Raw sources → **this wiki** (the notes) → this schema. Read it before editing notes or running Ingest/Lint.

This folder (`docs/architecture/` in `uphub-agents`) is the **canonical design record**. It is a model-maintained, interlinked Markdown wiki — a *compiled knowledge artifact* that accumulates, not a pile of raw notes. The repo is the source of truth (see the authority rule in [[uphub - Agent Overview]]).

## Note types
- **Hub / MOC** — `uphub - Agent Overview.md`. The index: TL;DR, authority rule, reading order, status dashboard. Exactly one.
- **Component notes** — `NN Name.md` (01–11). One concept each; numbered for reading order; named for what they represent.
- **ADRs** — `decisions/ADR-NNN Title.md`. The decision log (chronological by number). One settled decision each; immutable rationale, amended only with a status note.

## Required frontmatter
Every note carries YAML frontmatter:
```yaml
tags: [agent-ecosystem, <area>...]
status: design | built | accepted        # design = planned; built = shipped; accepted = ADR
updated: YYYY-MM-DD                        # bump on every edit
```
Component notes that describe shipped artifacts SHOULD add `source-of-truth:` pointing at the real file(s) (e.g. `rules/routing.json`). ADRs use `status: accepted` (+ "& built" once shipped).

## Conventions
- **Links:** Obsidian `[[wikilinks]]` by basename (`[[06 Skill Routing]]`); ADRs as `[[decisions/ADR-002 Route On Touch]]`. Alias with `|`. **No dangling links** — a `[[target]]` must resolve to a file (Lint enforces).
- **Naming:** the hub is the agent's name (`uphub - Agent Overview`), no number. Component notes keep `NN ` prefix. ASCII filenames (no em-dash/`·` in filenames — they break README/`%20` links).
- **Authority:** notes are *design-time* truth; the shipped artifact wins. If a note disagrees with code, fix the note (that's a Lint finding).
- **No bloat:** integrate new facts *into* the right note; don't append a new page per query. Granular but not sprawling.

## The three operations (llm-wiki)
1. **Ingest** — a new fact / decision / build-change arrives → find the right note(s), integrate it, update backlinks + the hub's dashboard, bump `updated`, add/append an ADR if it's a decision, then Lint. Procedure: the **`maintaining-the-architecture-wiki`** skill.
2. **Lint** — mechanical health check: `node scripts/lint-docs.mjs`. Flags ghost links, missing/old frontmatter, orphan notes, notes missing from the hub, and design/build contradictions. Run after every Ingest; treat ERRORs as blocking.
3. **Query (adapted)** — answer from the wiki; only file the answer back as a note if it's durable design knowledge, never auto-per-question (avoids bloat).

## Special files
- **Index** = the hub (`uphub - Agent Overview`). **Log** = the `decisions/` ADRs + git history. `Pipeline Map.canvas` = the visual. `explainer.html` = the Hebrew presentation (rendered output, not a source note).

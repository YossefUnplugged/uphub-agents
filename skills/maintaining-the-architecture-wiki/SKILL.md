---
name: maintaining-the-architecture-wiki
description: Use when a new design decision, build change, or fact must be recorded in the agent's architecture docs (docs/architecture/), or when a note has drifted from the shipped code — i.e. whenever you would otherwise just append a note or leave the design record stale.
---

# Maintaining the Architecture Wiki (Ingest)

The `docs/architecture/` vault is a **model-maintained, interlinked Markdown wiki** (the llm-wiki pattern): a *compiled knowledge artifact* that accumulates and stays consistent — not a pile of append-only notes. This skill is the **Ingest** operation. Read [`docs/architecture/_SCHEMA.md`](../../docs/architecture/_SCHEMA.md) first; it defines note types, frontmatter, and conventions.

## Core principle
**Integrate, don't append.** A new fact goes *into* the note that owns that concept, with cross-links updated — never a new orphan page, never a stale claim left standing. The repo is the source of truth: if a note disagrees with shipped code, the code wins and you fix the note.

## The Ingest loop
1. **Locate the owning note.** Which concept does this fact belong to? (routing → `06 Skill Routing`; a security control → `08 Security Model`; a decision → a new/existing ADR.) One concept, one home.
2. **Integrate** the fact into that note — edit the relevant section; reconcile anything it now contradicts (don't leave both the old and new claim).
3. **Update the graph:** add/fix `[[wikilinks]]` both ways (the note ↔ related notes), and update the hub (`uphub - Agent Overview`) — its reading order + **status dashboard** — if the change affects scope/status.
4. **Record decisions as ADRs.** If it's a *decision* (a chosen tradeoff), add `decisions/ADR-NNN Title.md` (next number) and link it from the notes it drives. ADRs are the chronological log; don't rewrite an old ADR's rationale — amend with a status line.
5. **Stamp frontmatter:** bump `updated:` (today, YYYY-MM-DD); flip `status:` `design → built` when the thing ships; add `source-of-truth:` pointing at the real file once built.
6. **Lint:** run `node scripts/lint-docs.mjs`. Fix every ERROR (ghost links, missing frontmatter, hub gaps) before finishing. Lint is the gate, like Gate A for code.

## Quick reference
| Trigger | Action |
|---|---|
| New fact about an existing concept | Edit its owning note; update backlinks; bump `updated` |
| A chosen tradeoff / settled argument | New `ADR-NNN`; link from driven notes; reference in `_SCHEMA` log if structural |
| Something shipped that a note called "planned" | `status: design → built`; add `source-of-truth:`; reconcile the dashboard |
| A note names a file/flag that no longer exists | Fix the note to the real artifact (code wins) |
| Renamed/added a note | Update the hub + every inbound `[[link]]`; run Lint |

## One example — ingesting a build change
> Route-on-touch shipped as `route-on-touch.mjs` reading `routing.json`, but `06 Skill Routing` still described `route.mjs` + `skill-routing.md`.
1. Owning note = `06 Skill Routing`. 2. Rewrote the Mechanism section to the real files + behaviour (injects the `hint`, not the SKILL body). 3. Linked nothing new; 4. amended `ADR-002` ("Accepted **& built**", dropped the stale GHA caveat); 5. `status: design → built`, `source-of-truth: rules/routing.json …`, bumped `updated`; 6. `lint-docs` → 0 errors.

## Common mistakes
| Mistake | Fix |
|---|---|
| Append a new note instead of editing the owner | Integrate into the owning note (Principle) |
| Leave the old claim next to the new one | Reconcile — one truth per note |
| Rename/add a note, forget the backlinks/hub | Update all `[[links]]` + hub; Lint catches the rest |
| Record a decision only in prose | Add an ADR; it's the decision log |
| Bump nothing | Always bump `updated:`; flip `status:` when shipped |
| Skip Lint | Run it; ERRORs are blocking |

## Why this skill exists
Design records rot: notes drift from code, links break, "planned" never becomes "built", contradictions pile up. Treating the vault as a maintained artifact (Ingest + Lint every change) keeps it a *compiled* source of truth a future model can trust — the same determinism discipline we apply to code, applied to the docs.

---
tags: [agent-ecosystem, architecture, modularity]
status: design
updated: 2026-06-16
---

# 11 Profiles and Niches — the modular "puzzle" architecture

> **TL;DR:** One agent, many niches. A universal **CORE** never changes; each **NICHE PROFILE** is a pluggable set of optional layers. To clone the agent to a new niche (Java service, Android app, …) you keep CORE and swap the profile. Layers fit together like puzzle pieces.

## Why
We're not building one agent — we're building an **agent architecture** that replicates across the company's niches: today a **front+back dev** agent (the `admin` niche); tomorrow a **Java service** agent, an **Android** agent, etc. The engineering rules (git, Jira, AAA, the pipeline, the gates, the security posture) are identical for all of them. Only the *domain knowledge* and *toolchain* differ. So we separate the two.

## CORE — universal (every niche inherits this, unchanged)
- **The pipeline** (`prompts/triage.md`): poll → readiness → spec extraction → implement → Gate A → Gate B → draft PR → Jira. Same for every niche.
- **Standards** (`standards/`): `git.md`, `jira.md`, `internal-access.md`, `aaa-permissions.md`. Org-wide; identical everywhere.
- **The gates**: `scripts/validate.mjs` framework (Gate A), the fresh-context review (Gate B). The *checks* are core; only the *commands* are niche.
- **Mechanisms**: route-on-touch hook, sync-target, harvest-context, scheduler, the human gates (draft-PR terminal state, human merge).

## NICHE PROFILE — pluggable, per niche (the puzzle pieces)
A profile is the set of layers that make the agent fluent in ONE niche:

| Layer | admin (front+back) | Java service (future) | Android (future) |
|---|---|---|---|
| **Domain skills** | `admin-*` (tRPC/React/Redux/MUI) | `java-*` (Spring, JPA) | `kotlin-*` / `android-*` |
| **Design layer (OPTIONAL)** | MUI admin theme + shared brand tokens | — (backend, no UI) | **`unplugged-design`** (UP-phone system) |
| **Routing table** (`rules/routing.json`) | admin path globs → skills | Java package globs | Android module globs |
| **Toolchain** (validator commands in `config/targets.json`) | `nx`, `tsc` | `gradle`/`mvn`, `ktlint` | `gradlew`, `ktlint`/`detekt` |
| **Target config** | repo path + AAA service `ADMIN_CLIENT` | its repo + AAA service | its repo + AAA service |

**A niche = CORE + one PROFILE.** To onboard a new niche: keep CORE, author a profile (skills + optional design + routing + toolchain + target). Nothing in CORE changes.

## The design layer is OPTIONAL and per-niche
- `skills/unplugged-design/SKILL.md` is the **UP-phone mobile design system** (360×800, Inter, Royal Blue `#495dc5`, pill buttons). It is the **design profile for the mobile/Android niche** — load it only where there's a UP-phone UI surface.
- **Backend-only niches skip the design layer entirely** (no UI → no design profile).
- The **admin niche** is a **desktop web** tool (React + MUI), so it does NOT use the 360×800 mobile rules. It uses the admin MUI theme — but it SHARES the Unplugged **brand tokens** that translate to any surface: primary `#495dc5`, pill buttons, `Inter`, the input styling (radius/border/focus `#495dc5`), semantic green `#00B931` / red `#ed2736`. Those brand tokens are the cross-niche constant; the layout system (mobile frame vs desktop) is the per-niche part.

## Rule of thumb (so layers stay puzzle-shaped)
- If a rule is true for **every** niche → it belongs in **CORE** (`standards/`, `prompts/`).
- If a rule is true only for **one language/product** → it belongs in that niche's **profile** (`skills/`, routing, toolchain).
- Brand identity (colors, type, button/input shape) is **shared**; layout/framework is **per-niche**.
- A profile may **omit** any optional layer (a Java service has no design layer). Optionality is the point.

Related: [[04 Agent Roster]] · [[05 Context Layers]] · [[06 Skill Routing]] · [[10 Ecosystem Map]]

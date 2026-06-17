---
name: admin-design
description: Use when building or styling any admin web UI — a page/screen, table, dialog, form, input, select, button, tab, status chip, or card — or when a screen looks off-brand, washed-out, centered, or narrow instead of matching the AAA/administration screens. Admin web only (MUI + tss-react + Poppins); NOT the UP-phone mobile system.
---

# Admin Web Design System

The canonical design system for the **admin web app** (`apps/admin_client`). Every token here is lifted 1:1 from the shipping **AAA / `administration`** UI (permission manager) — the reference for how a table, form, input, button, dialog, and tab should look. Not invented, not the UP-phone mobile system.

> When a value here conflicts with the `unplugged-design` skill: **`unplugged-design` is mobile (360×800, Inter); ignore it for admin web.**

## Core principle
A new admin screen must be **indistinguishable from the AAA/administration screens**. Match them first; never introduce a colour, radius, or font not already on screen.

## REUSE before you rebuild
These reusable components already exist — pass props, don't re-implement:
- **Table** → `administration/GenericTable` · **Search** → `administration/TableSearch` · **Add/Edit dialog+form** → `administration/.../AddItemDialog` · **Tabs** → `administration/NavigationTab`

**For the exact 1:1 code of each (button, input, select, table, dialog/form, tab, search): read [`component-recipes.md`](component-recipes.md).**

## Quick reference — tokens (AAA truth)

| Thing | Value |
|---|---|
| **Font** | `Poppins, sans-serif` (global) |
| **Primary** | `#495dc5` · hover `#3d4fa3` · disabled `#495dc550` |
| **Tints** | selected-row / app-tint `#495dc524` · menu hover `#495dc510` · menu divider `#495dc530` |
| **Surface / card** | `#fff`, radius **15px**, shadow `0 0 10px rgba(0,0,0,.1)` |
| **Screen title** | `#495dc5`, weight **700**, **20px** |
| **Primary button** | `variant="contained"`, fill `#495dc5` → hover `#3d4fa3`, white, `textTransform:none`, **14 / 500**, padding 8/24. **Rectangular** (default radius) — NOT a pill. |
| **Secondary button** | `variant="outlined"`, `#495dc5` border+label, hover bg `#495dc510`, padding 8/16 |
| **Form input / select** | RHF `Controller` in `<FormControl fullWidth margin="normal">`, default MUI outlined, errors via `<FormHelperText>`, keys from an enum |
| **Search field** (only pill input) | height 30, radius **20**, border `#C8CCDC`, focus `#495dc5`, 12px |
| **Table** | `@mui/x-data-grid` DataGrid: white, radius 15, **`border:1px solid #495dc5`**; headers `#f5f5f5` 20px bold; rows pointer+hover `#f0f0f0`; selected `#495dc524`; cells `#666` 14px divider `#e0e0e0`; footer+separators hidden; clickable rows; sticky-right edit/delete `IconButton`s gated by `PermissionControl` |
| **Tabs** | pill radius 30, idle `#C8CCDC80`/black, hover+selected `#495dc5`/white, 12px |
| **Dialog** | `maxWidth="sm" fullWidth`, body in `<form onSubmit>`, title 20/600, one dialog for add+edit (switch on `mode`) |
| **Empty / muted text** | `#757575` / `#666`, 16px centered "No data available" |

## The three layout rules that bite
1. **The top-level page root must FILL the content area — but with a small gutter, never edge-to-edge.** Routed screens render inside `appLayout`'s `contentContainer`, a flex row with `justifyContent/alignItems: center`. Two failure modes to avoid:
   - root with **no width** → shrinks to content, renders **centered and narrow** (bug);
   - root at a flat **`width:100% / height:100%`** → bleeds edge-to-edge and **butts against / overflows neighbouring components** (bug).
   Correct (matches Store/VPN's `padding:0 10px`): a 10px side gutter, subtracted from the width so nothing overflows — `margin:"0px 10px"; width:"calc(100% - 20px)"; height:"100%"; boxSizing:"border-box"`.
2. **Wrap title + controls + table in ONE white card** (radius 15, soft shadow) on the app background; never leave the title or search/filters floating on the bare page while only the table is carded.
3. **Leave a little space between sibling components** — adjacent cards/panels get a gap (`gap`/`margin` ~10–12px); a screen's content should never touch the app chrome or a neighbouring panel.

## Build the COMPLETE feature
A table is interactive: **row click → detail/edit** (a static table where clicking does nothing is a bug). Inspect the service's full API and expose list · get-one · create · update · delete (with confirm). Surface anything you intentionally omit in the PR. Sticky header, hover+pointer rows, dividers, chips, and empty/loading/error states are part of "done". (Full ordering rule: `standards/design.md`.)

## Common mistakes (observed here)
| Mistake | Fix |
|---|---|
| `Inter` / mobile tokens (radius 12, flat rows) | Admin web is **Poppins**; cards/table radius 15 |
| Pill-shaped action buttons | AAA buttons are **rectangular** (`#495dc5` contained / outlined); pill is search-only |
| Copied `admin-components` placeholders (`#1976d2`,`#333`,`#e0e0e0`, radius 8) | Use the tokens above / the recipes file |
| One-off colour (e.g. `#6C63FF`) | Only `#495dc5` + neutrals already on screen |
| Root has no `width` → centered/narrow | Fill with a side gutter: `margin:0 10px; width:calc(100% - 20px)` (Rule 1) |
| Root at flat `width:100%/height:100%` → bleeds edge-to-edge, touches neighbours | Subtract the gutter via `calc(...)` (Rule 1) |
| Hand-rolled `<table>`, non-clickable rows | Reuse `GenericTable`; clickable rows, gated edit/delete, states |
| Rebuilt a table/dialog from scratch | Reuse `GenericTable` / `AddItemDialog` unless the ticket truly needs more |

## Why this skill exists
Design is part of determinism: the agent must not invent a look. These tokens are read from the AAA production UI so every agent-built admin screen is consistent and on-brand. Baseline failures that motivated it (all real): a `#6C63FF` one-off, mobile tokens on a web screen, `admin-components` `#1976d2` placeholders, and a screen centered because its root lacked `width:100%`.

---
name: admin-design
description: Use when building or styling any admin web UI — a page/screen, table, dialog, search field, button, status chip, or card — or when a screen looks off-brand, washed-out, centered, or narrow instead of matching Store/VPN. Admin web only (MUI + tss-react + Poppins); NOT the UP-phone mobile system.
---

# Admin Web Design

Concrete, production-sourced design tokens for the **admin web app** (`apps/admin_client`). Every value below is lifted from shipping screens (Store, VPN, administration) — not invented, not the UP-phone mobile system. When a value here conflicts with the `unplugged-design` skill, **`unplugged-design` is mobile (360×800, Inter); ignore it for admin web.**

## Core principle

A new admin screen must be **indistinguishable in style from the screens around it** (Store, VPN). Match the neighbour first; reach for tokens here to fill gaps; never introduce a colour, radius, or font that isn't already on screen.

## Quick reference — the tokens (production truth)

| Thing | Value | Source |
|---|---|---|
| **Font** | `Poppins, sans-serif` (global, `!important`) | `styles/theme.ts`, `index.css` |
| **Primary** | `#495dc5` | everywhere (titles, focus, scrollbar) |
| **Primary dark (hover)** | `#3d4ea8` | button hover |
| **App background** (behind cards) | `#495dc524` (primary @ ~14%) | `appLayout` container |
| **Surface / card** | `#ffffff`, radius **15px** (12–16 ok), shadow `0 0 10px rgba(0,0,0,.1)` | Store `detailsPanel`, VPN `regionContainer` |
| **Screen title** | `#495dc5`, weight **700**, size **20px** | VPN `title` |
| **Search / text input** | height **30**, radius **20**, `border: 1px solid #C8CCDC`, focus `1px solid #495dc5 !important`, fontSize 12, `direction: ltr` | Store `appSearch`, administration `TableSearch` (identical) |
| **Input hairline** | `#C8CCDC` | search bars |
| **Dividers** | `rgba(0,0,0,.06)` rows · `rgba(0,0,0,.10)` heads | coupons table |
| **Primary button** | fill `#495dc5`, white label, radius **100 (pill)**, `textTransform: none`, weight 600, hover `#3d4ea8` | brand pill |
| **Secondary/outlined button** | border+label `#495dc5`, radius 100, hover bg `rgba(73,93,197,.08)` | brand pill |
| **Status chip** | radius 100, height ~22, weight 600; MUI `color="success"` / `"default"` | coupons chip |
| **Scrollbar** | width 6px, thumb `#495dc5`, track `#495dc570`, radius 10 | VPN `regionsViewContainer` |
| **Loading** | MUI `Skeleton` (`#cfe7ff`) over spinners for content | VPN `skeleton` |

## The two layout rules that bite

1. **Top-level page root must be `width: "100%", height: "100%"`.** Routed screens render inside `appLayout`'s `contentContainer`, which is a flex row with `justifyContent: center` + `alignItems: center`. A root WITHOUT an explicit width shrinks to its content and renders **centered and narrow**. Store/VPN roots are `width: 100% / height: 100%` — match that. Use `box-sizing: border-box` if you add padding.
2. **Wrap the whole screen — title, controls, table — in ONE white card** (radius 15, shadow above), on the `#495dc524` app background. Never leave the title or search/filter controls floating on the bare background while only the table is carded.

## One excellent example — a list screen that looks native

```typescript
// fooStyles.ts  — tss-react. Tokens above; nothing invented.
import { makeStyles } from "tss-react/mui";

const BRAND = { primary: "#495dc5", primaryDark: "#3d4ea8", border: "#C8CCDC", surface: "#fff" };

const useStyles = makeStyles()(() => ({
    root: {                          // RULE 1: fills the centering contentContainer
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: BRAND.surface,   // RULE 2: one white card wraps everything
        borderRadius: "15px",
        boxShadow: "0 0 10px rgba(0,0,0,0.1)",
        padding: "20px 24px",
        boxSizing: "border-box",
        overflow: "hidden",
    },
    title: { color: BRAND.primary, fontWeight: 700, fontSize: "20px" },
    searchField: {
        minWidth: "220px",
        "& .MuiOutlinedInput-root": {
            borderRadius: "20px",
            "& fieldset": { borderColor: BRAND.border },
            "&.Mui-focused fieldset": { borderColor: BRAND.primary },
        },
    },
    addButton: {                     // pill, brand fill
        backgroundColor: BRAND.primary, color: "#fff",
        borderRadius: "100px", textTransform: "none", fontWeight: 600, padding: "6px 24px",
        "&:hover": { backgroundColor: BRAND.primaryDark },
    },
    tableContainer: { flex: 1, overflow: "auto" },
    tableHead: { backgroundColor: "#eff0f6", position: "sticky", top: 0, zIndex: 1 },
    tableRow: {                      // interactive rows: pointer + hover
        cursor: "pointer",
        "&:hover": { backgroundColor: "rgba(73,93,197,0.06)" },
    },
    tableCell: { fontSize: "13px", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" },
}));

export default useStyles;
```

## Build the COMPLETE feature (not a read-only stub)

A table is interactive: **clicking a row opens a detail/edit view** (a static table where clicking does nothing is a bug). Inspect the service's full API and expose what it can do — list, get-one (row click → detail), create, update (edit), delete (with confirm). If an operation exists in the API but you're not surfacing it, **say so in the PR**. Sticky header, hover + pointer on rows, dividers, status chips, and empty/loading/error states are part of "done", not polish. (See the `design.md` standard for the full ordering rule.)

## Common mistakes (observed in this codebase)

| Mistake | Fix |
|---|---|
| Used `Inter` / mobile tokens (radius 12, flat rows) | Admin web is **Poppins**; cards radius 15, search radius 20 |
| Copied `admin-components` example values (`#1976d2`, `#333`, `#e0e0e0`, radius 8) | Those are placeholders — use the tokens above |
| One-off colour (e.g. `#6C63FF`) | Never; only `#495dc5` + neutrals already on screen |
| Root has no `width` → screen renders centered/narrow | `width: 100%; height: 100%` (Rule 1) |
| Title/search float on the page background | Wrap all of it in one white card (Rule 2) |
| Bare `<table>`, non-clickable rows | Sticky head, hover, pointer, row→detail, chips, states |

## Why this skill exists

Design is part of determinism: the agent must not invent a look. These tokens are read from production so every agent-built admin screen is consistent and on-brand. Baseline failures that motivated this skill (all real): a `#6C63FF` one-off, mobile tokens applied to a web screen, `admin-components`' `#1976d2` placeholders, and a screen centered because its root lacked `width: 100%`.

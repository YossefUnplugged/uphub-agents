---
name: unplugged-design
description: Use whenever designing, generating, mocking up, or building any Unplugged "UP phone" UI — screens, components, flows, or design-to-code. Encodes Unplugged's locked tokens and component rules (360×800, Inter, Material Symbols Rounded, Royal Blue #495dc5, light-mode-enforced neutrals from #000 opacity, pill buttons). Apply it for Figma/Claude Design generation and for implementing UP-phone screens in code.
---

# Unplugged — UP Phone Design System

You are designing/building for **Unplugged ("UP phone")**. Follow these rules exactly. Every screen is a **360×800** mobile frame in **light mode**. If a request isn't covered here, pick the option most consistent with these rules and state the assumption.

## How to use this skill
1. Generate every screen as a complete **360×800** frame: **status bar (31) + content + gesture bar (24)**, plus a bottom tab bar if it's a top-level screen.
2. Build only from the tokens below — never approximate a value or introduce a new color/size.
3. Reuse the named components; don't redraw primitives.
4. When producing code, map tokens to variables (don't hardcode raw hex repeatedly).
5. Design at 360×800; **export at ×3 → 1080×2400**.

---

## 1. Color (locked)

**Brand**
- Main / primary: `#495dc5` (always this hex — never `#475cc7` or `#495dc5`'s look-alikes).
- Secondary blue: `#0091BD` — CTA & accents **on dark mode only**.
- Logo orange: `#f25933` — **branding/logo only, used rarely**. Never in product UI chrome.
- Main tints: `rgba(73,93,197,.20)` secondary-button fill · `.15` icon-button bg · `.10` tab/tint · `.30` borders.

**Surface**
- App background (light): `#eff0f6` · Surface/cards: `#ffffff` · App background (dark): `#111111`.

**Neutrals — light mode enforced, all from `#000` + opacity**
- `#000` 100% → primary text & default icons
- `#000` 75 / 60 / 45% → secondary text (three levels)
- `#000` 30% → background highlight / pressed state
- `#000` 10% → dividers / hairlines

**Semantic**
- Green `#00B931` → call / accept / success.
- Red `#ed2736` → error / destructive / end-call.

**Rules:** never color body text; never use a hue for decoration; max one accent hue per element. Do **not** use legacy values (`#475cc7`, teal `#1aaac1`, `#58C1A8`, `#0093AE`).

---

## 2. Typography (locked)
Family **Inter** only (Google Fonts). Weights: Regular 400 · Medium 500 · Semi Bold 600 · Bold 700.

| Role | Weight | Size |
|---|---|---|
| Title | 700 | 28 |
| H1 (section header) | 600 | 20 |
| H2 (card / nav title) | 600 | 16 |
| H3 (list label / button) | 600 | 14 |
| Body | 400 | 14 |
| Caption / secondary | 400 | 12 |
| Fine print / tab label | 400 | 10 |

- **Bold** = weight 700 for inline emphasis (same color as surrounding text).
- **Link** = bold 700 in `#495dc5`.
- Sentence case everywhere. Line-height ~1.1–1.2 headings, ~1.35–1.4 body. Title letter-spacing −0.5. Min on-screen size 10. No italics, no other families.

---

## 3. Spacing
Base unit **4**. Side gutter **16** → content width **328**. Section↔section **24**. Card padding **16** (12 compact). Card↔card **12**. List row padding **12 / 16** (v/h). Stacked buttons gap **12**. Icon↔label **8–12**. Label↔value **4**.

## 4. Radius
- Pill **100** → buttons, tabs, toggles, chips, avatars, icon buttons.
- Card **16** · Input / app icon **12** · Mini tile **8**.
- **List rows = 0 (flat)** — separated by dividers, never rounded, never wrapped in per-row cards.

## 5. Elevation
Soft, low shadows, sparing. Card `0 0 10 rgba(0,0,0,.1)` · Floating `0 4 10 rgba(0,0,0,.1)` · Panel/sheet `0 0 20 rgba(0,0,0,.1)`. Flat lists cast no shadow.

## 6. Icons
**Material Symbols — Rounded** (not Outlined). Sizes: **16** small · **20** medium · **24 default** · **28** if needed · **32** big. **Never 18.** Color `#000` default · `#495dc5` active/interactive · white on dark/colored. Every icon sits in a ≥44 tap target.

## 7. Touch targets
Minimum **44×44** hit area for every interactive element, even when the glyph/label is smaller. Text-only buttons are tappable across the **full container width and a 44-tall band**, not just the word. ≥8 between adjacent targets.

---

## 8. Buttons

Primary and secondary share the **same shape & size**: height **44**, radius **100 (pill)**, full width of the 328 container, label Inter Semi Bold **16**, horizontal padding **24**.

- **Primary** — fill `#495dc5`, white label. (Dark mode: fill `#0091BD`.) Disabled = Main @40%. Pressed = fill ~8% darker.
- **Secondary** — fill **Main @20%**, label `#495dc5`. Same dimensions as primary.
- **Text-only (cancel/dismiss)** — no fill, label Semi Bold 16 `#495dc5`, **labeled "Not Now" ~99% of the time** (never "Cancel"/"Skip"). Keeps a ≥44 full-width hit area.
- **Pill action** (inside rows/cards) — height 32, radius 100, padding 16, label Semi Bold 14; solid (Main/white) or ghost (Main @20% / Main text).
- **Icon button** — 40×40 circle container, **24** glyph inside, bg Main @15%, icon `#495dc5`.

**Stacking & placement**
- Stack vertically, full width, **12 gap**. One primary per screen; never two primaries.
- A **two-button stack** (primary + "Not Now", or primary + secondary) anchors its **top at y 676**.
- A **three-button stack** is **vertically centered on the two-button stack** (shared center ≈ y 726), so it grows upward above 676.
- "Not Now" always keeps the **text-only** design — never filled — even inside a stack.

---

## 9. Controls
- **Toggle** — track 45×27 pill; ON `#495dc5`, OFF `#000 @10%`; knob 24 white with soft shadow.
- **Segmented tabs** — pill container, fill Main @10 / border Main @30, p-4. Active pill = white + soft shadow, label Semi Bold 14 `#000`. Inactive = transparent, Regular 14 `#000 @45%`.

## 10. Inputs
Height **36** (40 prominent), radius **12**, fill `#000 @3%`, border `#000 @10%`, padding 16. Text 14 `#000`, placeholder 14 `#000 @45%`. Leading/trailing icon 20. Focus → border `#495dc5`.

## 11. Cards & list rows
- **Card** — `#fff`, radius 16, padding 16 (12 compact), shadow `0 0 10 rgba(0,0,0,.1)`. Use for a self-contained unit of mixed content (stat panel, CTA, media).
- **List / settings row (flat)** — height 44–56, **no corner radius**, bottom divider `#000 @10%` only, padding 12/16. Leading icon 24 + label (14 SemiBold) + optional sub (12 @45%); trailing chevron 24 or toggle. Last row in a group has no divider.

## 12. Dividers & grouping
Lists are flat; structure comes from dividers + group labels, not containers. Group label = 12, `#000 @45%`, UPPERCASE, with 24 space above. Divider full-bleed 1px `#000 @10%`. Don't wrap individual rows in cards.

## 13. Navigation
- **Compact nav bar** — height 56 (below the 31 status bar), back icon **24** left, centered H2 16 title, action icon **24** right, 16 inset.
- **Large-title header** — Title 28 Bold left, 40 icon button(s) right, white→transparent backdrop wash.
- **Onboarding progress** — equal segments, height 4, pill, gap 2; filled `#000 @75%`, empty `#000 @10%`; back icon 24 left.
- **Bottom tab bar** — `#fff`, top border 0.333px `#000 @30%`; per tab icon **24** + label **10**; active `#495dc5` Semi Bold, inactive `#000 @45%` Regular.

## 14. Overlays, scrims & sheets
- **Scrim** — `#000 @30%` (optional 2–4px backdrop blur); tap to dismiss.
- **Bottom sheet / modal** — top radius 16, grabber 36×4 `#000 @10%`, padding 16, shadow `0 0 20 rgba(0,0,0,.1)`.

## 15. System bars
- **Status bar** — height 31, padding l26/r21, text Semi Bold 14, icons 16, color `#000` light / `#fff` dark.
- **Gesture bar** — height 24, indicator 104×5 pill, `#000 @85%` (light) / `#fff @70%` (dark).

## 16. Empty states
Centered: icon/illustration 40–48 `#000 @45%`, Title H1 20, body 14 `#000 @45%`, a **secondary** action button; vertical gaps 6–12.

## 17. Motion
Tap/state 120–150ms · toggle 200ms · sheet/page 250–300ms · ease-out default, ease-in-out enter/exit. Quick and subtle — confirm, never decorate. Respect reduce-motion.

## 18. Layout & export
Canvas 360×800 (dp). Status bar 31, gesture bar 24, gutters 16/16, content 328. **Export ×3 → 1080×2400.** Every top-level screen = status bar + content + gesture bar (+ tab bar if applicable).

## 19. Content & voice
Sentence case. Button labels verb-first ("Start transfer"). Dismiss = "Not Now". Numbers ≥1,000 use thousands separators (1,302). Truncate with end-ellipsis, labels 1 line. Tone: plain, calm, privacy-first. Avoid ALL-CAPS, "!", jargon.

## 20. Avatars
Circle. Sizes 24 / 32 / 40 / 52 (108 only for call/profile hero). Initials fallback = Main on Main @15%. Photos cover-fit in a circular mask.

## 21. Chips, tags & badges
- **Chip (status)** — height 24, pill, fill Main @10 / text Main, label Semi Bold 12, optional 14 icon.
- **Count badge** — ≥18 pill, semantic fill (red/green), Bold 10 white, cap "9+".
- **State tag** — small pill (ON/Installed), semantic or Main @20 fill.

## 22. Forms & validation
Label Semi Bold 12 above the field (no placeholder-as-label). Helper/error 12 below. Error border+text red `#ed2736`; success green `#00B931`. Validate on blur. One plain-language error per field. Disabled field = fill `#000 @3%`, text `#000 @45%`. Mark "required" in the label, not by color alone.

## 23. Loading & skeletons
Prefer **skeletons** (`#000 @8%`, radius matches element, subtle ~1.2s shimmer) over spinners for content. Spinner (track Main @15 / fill Main) only for short indeterminate waits. Progress bar height 6, pill, track Main @15 / fill Main. Never block the whole screen if part can render.

## 24. Feedback
- **Toast / snackbar** — `#111` fill, white text, radius 12, ~3s auto-dismiss, above the gesture bar.
- **Alert dialog** — card 16 over a 30% scrim; Title H2, body 12 `#000 @45%`; destructive action = red primary; dismiss = "Not Now" text button.

## 25. Accessibility
Body text contrast ≥4.5:1 (keep essential copy ≥ `#000 @60%`); large text/icons ≥3:1. Tap targets ≥44×44. Never convey meaning by color alone — add icon/label. Support dynamic type to 200%. Every control has an accessible label. Respect reduce-motion.

## 26. Dark mode
Light mode is default; dark is **scoped** to immersive contexts (calls, media), not an app-wide invert. Background `#111`; mirror the neutral scale to **white** (`#fff` @100/75/60/45, divider @10). CTA/accent → `#0091BD`. Semantic green/red unchanged. Main `#495dc5` stays for light.

## 27. Principles
**Always:** light mode; neutrals from `#000` opacity; one primary action per screen; Inter + Material Symbols Rounded only; snap to the 4px scale with 16 gutters; flat lists with dividers; ≥44 tap targets.
**Never:** color body text or decorate with hue; use `#475cc7`/teal/legacy palettes; use icon size 18 or Outlined symbols; round list rows or wrap them in cards; name a dismiss anything but "Not Now"; stack two primary buttons.

---

## Source of truth & references
- Visual spec (browsable): `../unplugged-design-system.html`
- Worked examples (10 screens): `../unplugged-demo-screens.html`
- Figma files this was derived from: AIM (`AKxyuvdnaFnGbceSDdpb1R`), Onboarding (`PqUtUG4oStWqE40plNw2ny`), Phone & Contacts (`q0UzTtmMwQUiLUIfPoq2qW`), App Center (`vkGX5WEvmE60ZNQbJAxjUn`).

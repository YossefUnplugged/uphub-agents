# Design tasks — how the agent handles any UI / design work (CORE)

A design/UI task MUST follow this order. Step 1 is the highest priority — **consistency with the existing app beats inventing a new look.**

## 1. Inspect the EXISTING system FIRST
Before writing any UI, look at how the TARGET app already styles things, and **match it**:
- the component library + theme (e.g. admin = MUI + `tss-react` theme),
- **existing similar screens** — how neighbouring features (Store, VPN, …) style their buttons, inputs, tables, dialogs, pagination, empty/loading states,
- shared style files / tokens already in the repo.

Build the new screen so it looks like it **belongs next to the existing ones**. **Never introduce a new colour or shape that diverges from the existing screens** (the coupon screen's first version used a one-off `#6C63FF` — wrong; it should have matched the app's established controls).

## 2. Use Anthropic's frontend-design skill
Load **Anthropic's `frontend-design` skill** for the design methodology — visual hierarchy, spacing rhythm, layout, responsive behaviour, state coverage (empty / loading / error), and accessibility. Apply it to every design task (install it from the skills marketplace if it isn't present). This is the "how to design well" layer, on top of the "what our brand looks like" layer.

## 3. Apply the niche's design profile (brand)
On top of the existing-system match, apply the niche's design profile (see [[11 Profiles and Niches]]). For our product the brand layer is **`unplugged-design`** — primary `#495dc5`, `Inter`, pill buttons, input radius 12 + focus `#495dc5`, semantic green `#00B931` / red `#ed2736`. **Reconcile brand tokens WITH the existing system**; where they conflict, prefer the established app pattern unless the ticket explicitly asks to rebrand.

## Order of authority (when they disagree)
existing-app convention  →  then frontend-design methodology  →  then brand tokens.
The result must be indistinguishable in style from the screens around it.

## Why this rule exists
Determinism applies to design too: the agent must not invent a look. It reads the existing system, applies a real design methodology, and layers the brand — so every agent-built screen is consistent, on-brand, and looks native to the app.

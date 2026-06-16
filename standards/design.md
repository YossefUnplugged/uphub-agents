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

## Build the COMPLETE feature, not a read-only stub
A UI over a service must expose what the service can actually DO — not the minimum. Before building:
1. **Inspect the full API surface** of the service (the swagger / controller): list **every** operation — list, **get-one/detail**, **create**, **update/edit**, **delete**, status changes, export. Do NOT stop at list+create.
2. **Map each operation to a UI interaction** and build them:
   - list → table/grid (with real UX: loading, empty, error, pagination, sort, search);
   - get-one/detail → **clicking a row opens a detail view** (rows must be interactive — a static table where clicking does nothing is a bug);
   - update → an **edit** action (row action or inside the detail view);
   - delete → a delete action (with confirm);
   - create → the create form.
3. **If an operation exists in the API but you're not exposing it, say so explicitly** in the PR/ticket (and why). Never silently ship a read-only list when the API supports full CRUD.
4. **Quality bar (use Anthropic's `frontend-design` skill):** a table is not "a bare `<table>`". Apply real list/table UX — comfortable row height + padding, clear dividers, sticky header, hover + pointer cursor on interactive rows, aligned numeric columns, well-styled status chips, a row-actions affordance (edit/delete or a chevron), and proper empty/loading/error states that match the app. **Wrap the whole screen's content — title, controls (search/filters/buttons), and table — inside a single white surface/card** (radius 16, soft shadow) on the app background; never leave the title or controls floating on the bare page background while only the table is carded.

## Why this rule exists
Determinism applies to design too: the agent must not invent a look. It reads the existing system, applies a real design methodology, and layers the brand — so every agent-built screen is consistent, on-brand, and looks native to the app.

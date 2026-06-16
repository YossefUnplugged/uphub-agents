# DRAFT needs-info comment — UNP-7672 "Coupons List & Search"
> Status: DRAFT — not posted. Awaiting human approval before posting to Jira + adding `ai-needs-info`.
> Target Jira action (on approval): addCommentToJiraIssue(UNP-7672) + label ai-needs-info.

---

Hi @reporter 👋 — I picked this up for the admin Coupons UI but I can't start implementation yet: the ticket is missing the parameters I need. Here's what I can already infer, and exactly what I need from you to proceed.

**What I think this is (please confirm):**
This looks like surfacing a back-office process from the **`up_coupon_proxy_service`** in the admin UI — i.e. the admin would proxy that service through a new tRPC `coupon` router (mirroring the existing `vpn` / `store` controllers), expose typed coupon models in `libs/admin-types`, and render a list + search screen under `apps/admin_client/src/components/coupons/`. If that's the wrong service or shape, tell me and I'll adjust.

**To implement "List & Search" I need:**
1. **API contract** — the `up_coupon_proxy_service` base URL + the list/search endpoint(s): path, method, query params (pagination, search), and the response payload shape (a Swagger/OpenAPI link is ideal).
2. **Coupon fields** — what a coupon record contains (e.g. code, type, discount value, validity window, usage limit/used count, status). These become the `@admin-types` model + the table columns.
3. **Search & filters** — what the user searches/filters by on this screen (by code? status? date range?).
4. **Permissions** — which AAA action/permission guards the Coupons screens (so the route + UI gate correctly).
5. **Design** — is there a Figma for the list/search screen? (If yes, I'll match it; if not, I'll follow the existing admin store/vpn table patterns.)
6. **Estimate + QA** — the ticket has no estimate and no QA assignee; both are required before I can start (our workflow gate).

**What happens once you reply:** I'll implement on a branch named `UNP-7672` (never on main), run the full compliance gate (lint/typecheck/tests) + a security review, and open a **draft PR** for human review. I won't touch production.

Thanks! — automated triage (local agent)

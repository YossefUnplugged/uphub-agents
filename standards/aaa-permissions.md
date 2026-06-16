# AAA permissions / actions — registering new permissions (up-aaa-sync)

When a ticket adds **new API routes** or **new permission gating** (`RequirePermission`, a new `Actions` enum value), those permissions do NOT exist until they are registered in the **AAA PostgreSQL `action` table** and assigned to a policy. If you skip this, the gated screen/button is invisible to everyone (the permission can't be granted) — exactly the "I can't see what the agent built" trap.

**The org has a dedicated tool for this: `up-aaa-sync`** (repo `werunplugged/up-aaa-sync`). It scans a project for routes, derives action names, and syncs them to the AAA DB. It is an MCP server.

## The hard rule (closing step)
If your diff adds/changes any API route, `Actions` enum value, or `RequirePermission` gate, you MUST, before finishing:
1. **Scan** the target with `up-aaa-sync` (`scan_routes`, read-only) to see the actions it derives from the new routes.
2. **Align names, don't invent.** AAA action names are **route-derived** (e.g. `POST /products/admin/promotion-code` → an action). Do NOT hardcode an unrelated UI-only permission string and assume it exists — the UI's `RequirePermission` action must match a real AAA action. If you added a `Actions` enum value, verify it corresponds to a synced action name.
3. **Sync** with `sync_actions` (use `dryRun` first to preview) to insert the new actions into the AAA DB.
4. **Assign to a policy** with `assignActionToPolicy` so the relevant role can actually be granted it (else the feature stays invisible).
5. **DOCUMENT in the PR body AND the Jira ticket** (the ops handoff — non-negotiable):
   - the exact new permissions/actions added,
   - which routes they gate,
   - that they were synced via up-aaa-sync (or, if you couldn't sync, that they STILL need syncing + assigning),
   - which policy/role needs them so the reviewer/admin can grant access.

## Action-name derivation from a route — PER ROUTE, not per feature
Gating is **per route/action**, never one blanket permission for a whole feature. Derive each action's name from its route path:
1. Strip a leading `/api/` (and any leading `/`).
2. Split into words on any non-alphanumeric char (`.` `/` `-` `_`).
3. Title-case each word (capitalize the first letter), join with single spaces.
4. Append ` - Admin`.

Examples:
- `/api/coupon.list`   → `Coupon List - Admin`
- `/api/coupon.create` → `Coupon Create - Admin`
- `/api/coupon.count`  → `Coupon Count - Admin`

The UI's `RequirePermission` for each screen/button MUST use the action derived from the SPECIFIC route it triggers — the list screen → the list route's action; the create button → the create route's action. One generic feature-level string (e.g. "View Coupons - Admin") is WRONG; it doesn't map to a real route and won't be found.

## Visibility gates on the MINIMAL read action
A screen and its nav button are shown when the user has the **minimal read permission** for the feature — the **GET that returns the collection/array (the "list")**. Having it means "you can view the data," and that's the bar for seeing the feature at all.

Rules:
1. **Nav button + screen route → gate on the list/collection-GET action** (the minimal read). Never gate visibility on create/update/delete/count/export.
2. **Every mutating or secondary control** (create button, delete, export, even count) gates on **its own** action.
3. **Missing a secondary permission must DEGRADE GRACEFULLY** — hide/disable only that control (and tolerate its API call failing) — it must NEVER hide or break the whole screen. Only the absence of the minimal read action hides the feature.

To pick the minimal action: among the feature's routes, choose the GET that fetches the collection (e.g. `coupon.list` → `Coupon List - Admin`). That single permission = "can view." Example: a user with only `Coupon List - Admin` sees the Coupon Manager button and the list of coupons; without `Coupon Create - Admin` the create button is disabled; without `Coupon Count - Admin` the count just doesn't render — the list still shows.

## MCP tools (registered once via setup)
`list_service_types` · `add_service_type` · `scan_routes` (read-only) · `sync_actions` (`dryRun` supported) · `listPolicies` · `addPolicy` · `assignActionToPolicy`.

## One-time setup (handled by scripts/setup.mjs)
- Register the MCP server: `claude mcp add up-aaa-sync -s user -- npx -p up-aaa-sync up-aaa-sync-mcp`
- Init the target: `npx up-aaa-sync init <target path>` → creates `.aaa.config.json` (fill in the AAA DB host/port/database/user/password/schema) + appends a CLAUDE.md note.

## Why this matters
A feature with permission gating is only "done" when its permissions are registered AND grantable. "Code merged" ≠ "feature usable." The agent must close that loop (sync + assign) or explicitly hand it off in the PR/ticket so a human does — never leave a silently-invisible feature.

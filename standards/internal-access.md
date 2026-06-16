# Internal / IP-restricted resource access

Some resources the agent needs are only reachable from the corporate network:
- internal swagger / OpenAPI (e.g. `https://up-app.unplugged-st.com/swagger/...`),
- private repos behind an org IP allow-list (e.g. `eranunplugged/up_product_service`),
- internal services the admin proxies.

Whether a direct fetch works depends on WHERE the agent runs:
- On the owner's machine (local-only, [[ADR-006]]): usually reachable.
- From an isolated/background environment: often **HTTP 403 / IP allow-list** blocked.

## An API contract has TWO sources — prefer the repo source
When you need an external API's shape (e.g. the coupons `promotion-code-admin-controller`):
- **(A) The service repo source — PREFERRED.** Read the controller + DTO classes directly from the service repo (e.g. `up_product_service`) via `gh` (`gh repo view`, `gh api .../contents`, or clone). The actual classes give EXACT field names + types — the ground truth. On a permitted machine `gh` reaches it natively (no browser needed).
- **(B) The swagger / OpenAPI.** The `…/v3/api-docs` JSON or the swagger UI — good, but generated; use if the repo isn't reachable.

## Resolution order (when the agent needs an internal resource)
1. **Direct fetch first.** Repo source via `gh` (option A above) — this is the cleanest autonomous path and works whenever `gh` is on a permitted IP. Swagger/OpenAPI → fetch the `…/v3/api-docs` JSON.
2. **If blocked (403 / IP allow-list / auth redirect) → use the local Chrome browser** via the `claude-in-chrome` MCP tools. The browser runs inside the user's authenticated session **on the permitted network**, so it reaches internal pages a raw fetch cannot. Load the tools with ToolSearch if deferred (`tabs_context_mcp, navigate, read_page/get_page_text, tabs_create_mcp`), open the swagger UI / api-docs, and read the contract from the rendered page.
   - **Account check FIRST (mandatory).** Before fetching anything, determine which Google account Chrome is using and **show it to the user**. It MUST match `config/browser.json` → `internalAccessEmail`. If it does NOT match (wrong account logged in — a common case), STOP, tell the user *"Chrome is currently signed in as `<X>`, but internal access needs `<configured email>` — please switch accounts (or confirm)"*, and wait. Never pull internal data on the wrong account.
3. **If the browser tool is unavailable** (not connected/loaded) **or the resource is still unreachable → STOP and request access from the manager/human.** Post a precise request — the exact URL/resource, what's blocked (403/IP), and why it's needed — via the needs-info draft and an `ai-needs-info` Jira comment to the reporter. Do not proceed.

## Hard rule
**Never invent an API contract, field, or endpoint to get unblocked.** If you cannot read the real contract via (1) or (2), escalate via (3). Mirroring the real contract is mandatory — the same "do not invent fields" rule the tickets carry.

## Capability note (for onboarding / "raising the agent")
This machine has the `claude-in-chrome` browser capability. A new teammate's setup MUST ask and store:
- **Which Google account email** the agent uses for internal tools → `config/browser.json` → `internalAccessEmail` (per-user; Yossef = `yossefbenhaimunplugged@gmail.com`).
- Confirm (a) Chrome + the Claude extension are connected, and (b) that account is logged in to the internal tools (swagger, Jira, GitHub SSO).

At run time the agent always **verifies + displays the active account** before using the browser (see step 2). If the wrong account is active, it asks the user to switch — it does not guess or proceed.

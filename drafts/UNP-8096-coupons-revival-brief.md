# UNP-8096 — Revive the Coupon (Promotion Code) admin UI, mapped to the REAL products API

> **Status:** DRAFT brief for the uphub agent. Human-locked the API contract (verified from the LIVE
> Swagger, not Postman); the agent does the implementation mapping + UI. Nothing implemented yet.
>
> **Why this exists:** the coupon feature was built, merged (PR #77), then **reverted out of v1.3.4**
> — it is NOT in `main` today (only 2 SVG assets survive). It was reverted because it was wired to a
> **list endpoint that does not exist** and shipped with **mock data**. This brief re-grounds it in the
> real `up_product_service` contract.
>
> **Source of truth:** live Swagger `promotion-code-admin-controller` at
> `https://up-app.unplugged-st.com/swagger/products/UP-Api/swagger-ui/` (spec: `/swagger/products/UP-OpenApiDoc`).
> The Postman collection was INCOMPLETE (missing update/delete/archive/bulk-check) — do not rely on it.

---

## 1. THE REAL API — from the live Swagger (LOCKED — do not deviate)

Base: `envConfig.upAppsBaseUrl`. Auth: `Authorization: Bearer ${envConfig.token}`.

| Operation | Method + path | Params / body | Returns |
|---|---|---|---|
| **Create N** | `POST /api/products/admin/promotion-code?number=N` (`createList`) | query `number`; body `PromotionCodeReqDto` | `PromotionCodeResShortDto[]` (JSON) |
| **Create N → CSV** | `POST /api/products/admin/promotion-code/file?number=N` (`loadCsv`) | query `number`; body same DTO | **`string` (CSV text)** — download, not JSON |
| **Update** | `PUT /api/products/admin/promotion-code` (`update`) | body: `code*`, `priceIds`, `expirationDate`, `timesRedeemed`, `active` | `PromotionCodeResShortDto` |
| **Delete** | `DELETE /api/products/admin/promotion-code?code=X` (`delete`) | query `code*` | 200 |
| **Archive** | `PATCH /api/products/admin/promotion-code?code=X` (`archive`) | query `code*` | 200 |
| **Bulk-name check** | `GET /api/products/admin/promotion-code/bulk?bulk=NAME` (`checkBulkNameAlreadyInUse`) | query `bulk*` | `boolean` |
| **Available count** | `GET /api/products/admin/promotion-code/available-count` (`getCountAvailablePromoCodes`) | none | `integer` |

**`PromotionCodeReqDto` (create body):** `code?`, `couponLength?`, `priceIds*` (≥1 price ObjectIds),
`expiredDate?` (string), `maxRepeats?` (default 1), `isActive?` (default true), `metadata?`.
**`PromotionCodeResShortDto` (returned):** `createdDate, code, active, expiredDate, timesRedeemed, maxRepeats, metadata`.

### 🚫 The one hard constraint
**There is NO list / search / get-all / enumerate endpoint.** You can create, and you can
update/delete/archive **a code you already know the string of** — but you **cannot browse or fetch the
set of existing codes**. So: **do NOT build, fake, or mock a "browse all coupons" table, and do NOT
invent a list/report endpoint.** (The GET `/bulk` is a name-in-use boolean check, NOT a listing.) If you
believe a full listing is required, STOP and flag it — never fabricate one.

### Gotchas to resolve (do not guess silently)
1. **Field-name inconsistency:** create uses **`expiredDate`**, update uses **`expirationDate`**. Send each
   exactly as its endpoint declares.
2. **`/file` returns a CSV STRING**, `contentType: */*` — the backend proxy + client must handle a
   text/blob download, not JSON parsing.
3. **`priceIds` sourcing:** mandatory product-price ObjectIds; the collection hardcodes them and there is
   no obvious "pick a price" endpoint here. Decide the input UX (free-text / comma list) OR flag that a
   price source is needed before the form is truly usable.
4. **`number`** is a query param on BOTH create POSTs (createList and loadCsv).
5. **update/delete/archive target by `code`**, not an internal id.

---

## 2. WHAT EXISTS TO REVIVE (branch `UNP-8096`) — and what's wrong

Recoverable from the `UNP-8096` branch history; reuse the good parts, fix these:
- `couponController.ts` — `countCoupons` → `available-count` ✅ keep. `createCoupons` conflates the two POSTs
  ❌ split into `createList` (`/promotion-code?number=N`) and `createCsv` (`/promotion-code/file?number=N`,
  CSV). `listCoupons` → `/inner/report/promotion-code` ❌ **fictional — remove**. **Add** the newly-available
  `update` (PUT), `delete` (DELETE), `archive` (PATCH), `checkBulkName` (GET /bulk).
- `couponRoute.ts` — drop `list`; expose createList, createCsv, update, delete, archive, checkBulkName, availableCount.
- `libs/admin-types/.../promotionCode.ts` — its header documents the fictional list/report endpoints; correct
  the contract doc; keep `PromotionCodeReqDto` + `PromotionCodeResShortDto` (they match), drop the report DTOs.
- `coupons.tsx` — a DataGrid of `MOCK_COUPONS` via `trpc.coupon.list` + search + status filter. **Remove the
  browse table, the mock data, and the list query.** Reshape per §3.
- `couponFormSchema.ts` / `createCouponDialog.tsx` — form already collects priceIds/code/couponLength/
  expiredDate/maxRepeats/isActive/number — reuse, aligning to §1.
- `couponDetailsDialog.tsx` — repurpose into the "manage a known code" flow (§3) or drop.

---

## 3. TARGET UI (product direction — owner confirms)

A **"Coupon Manager"** create+manage tool (design system: skill `admin-design`), NO browse table:
- **Header:** title + live **available-count**.
- **Create** (dialog): the form → `createList`; a "generate as CSV" toggle → `createCsv` + download the file.
  (Optional: for a named bulk, call `checkBulkName` first.)
- **Manage a code** (dialog): enter a known code → **update / archive / delete** it. (This replaces the old
  row-click-from-a-list flow, since there is no list.)
- **No table of all codes.** If the owner wants recently-created codes visible, show only the codes created
  in the **current session**, explicitly labelled — never presented as "all codes".

Permissions: gate create/update/delete/archive behind the matching `Actions` via `PermissionControl`; register
them through **up-aaa-sync** (`standards/aaa-permissions.md`). Follow `admin-conventions`, `admin-forms`
(RHF + Zod), `admin-errors` (snackbar).

---

## Division of labour
- **Human-locked (this brief):** the exact endpoint set + bodies + the no-list constraint + the gotchas —
  because the historical failure was *inventing* API surface, and "never-invent" must be enforced by the spec.
- **The agent's job (the test):** map these to tRPC route+controller shapes, wire the CSV download and the
  code-targeted update/delete/archive, reshape the UI to create+manage+count, resolve `priceIds`/field-name
  details against the live service (re-fetch the Swagger per `standards/internal-access.md` if needed, else
  flag), sync AAA permissions, match the design system. Draft PR is terminal.

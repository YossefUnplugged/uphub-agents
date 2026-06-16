# PLAN — Macro repo registry (org-wide context, token-cheap)

> Run this in a **separate session**. It builds a compact map of every company repo → its role + domain keywords, so the triage agent can say *"this ticket is probably about the coupons server"* without ever crawling the whole org. Output is one small file the agent reads cheaply at triage time.

## Why
A Jira ticket is often thin ("Coupons List & Search"). To write a useful needs-info comment AND to bootstrap implementation context, the agent needs to know **which backend server a task concerns**. Crawling ~100 repos per ticket would burn enormous tokens. Instead we crawl **once, cheaply, offline** and cache a tiny registry; triage reads it for near-zero cost.

## Output
`config/repo-registry.json` — one entry per active repo:
```json
{
  "generatedAt": "<iso>",
  "repos": [
    {
      "name": "up_coupon_proxy_service",
      "lang": "TypeScript",
      "role": "Proxy + DB service for discount/coupon codes; gateway swagger; Atlas-backed.",
      "domainKeywords": ["coupon", "discount", "promo", "voucher"],
      "source": "gh-desc | readme",
      "updatedAt": "<repo pushedAt>"
    }
  ]
}
```
Tiny (~100 short entries). Read in full at triage time for a few hundred tokens.

## Token-cost discipline (the whole point)
- **R1 is almost free** — pure `gh` metadata, ONE API call, zero cloning.
- **R2 reads only README heads** (≤ 40 lines), batched, on a **cheap model** (Haiku), and ONLY for repos whose `gh` description is thin/empty.
- **Skip** archived repos, templates (`template-*`), and obvious cronjob/infra repos (`up_k8s_*`, `*_terraform_*`) unless flagged — they rarely back an admin UI.
- **Incremental**: re-running R1 is free; R2 re-runs only for repos whose `pushedAt` changed since `generatedAt`.

## Phases

### R1 — metadata pass (free, do first)
```bash
gh repo list werunplugged --limit 300 \
  --json name,description,primaryLanguage,pushedAt,isArchived,isTemplate
```
For each non-archived, non-template repo: seed an entry with `name`, `lang`, `role = description` (if present), and derive `domainKeywords` from the name + description (tokenize, drop stopwords/`up_`/`service`). Mark `source: "gh-desc"`. This alone covers most repos (their descriptions are already informative, e.g. *"Automated APK/XAPK parsing service…"*). Write `config/repo-registry.json`.

### R2 — README enrichment (cheap, only the gaps)
Collect repos where `role` is empty or < ~5 words. Process in **batches** with a **cheap model**, one short agent per batch:
- For each repo, fetch only the README head: `gh api repos/werunplugged/<name>/readme --jq .content | base64 -d | head -40` (or `gh repo view <name>` for the rendered README intro).
- Emit a **one-line role** + 3–6 `domainKeywords`. Nothing else. Cap output hard.
- Update those entries, set `source: "readme"`.
Never read source files — README head only. If a README is missing, leave the gh-desc/role best-effort and move on.

### R3 — wire triage to consume it
- In `prompts/triage.md` (needs-info step) the agent already references `config/repo-registry.json`. Once the file exists, the agent: tokenizes the ticket summary/description, matches against `domainKeywords`, and names the top 1–2 candidate repos + their `role` in the needs-info comment ("likely related to `up_coupon_proxy_service` — role: …").
- Bidirectional / "raise its head": when the user replies with info (e.g. an API URL or a service name), the agent cross-checks the registry to confirm/suggest the owning server and to seed the implementation's external-contract assumptions.
- Sync the registry into the target like other context: add it to `sync-target.mjs` so `admin/.claude/context/repo-registry.json` is available locally to the running agent (gitignored).

### R4 — refresh (ongoing, cheap)
Re-run R1 anytime (free). Run R2 only for repos with `pushedAt > generatedAt`. Optionally fold this into a monthly step alongside `harvest-context`.

## Effort
R1: S (minutes, ~free). R2: M (token-bounded — only the thin repos, cheap model, capped). R3: S (small `sync-target` + triage wiring). 

## Note
R1 is so cheap it can be run immediately on request — the data from `gh repo list` is already available. R2 is the only part that spends (bounded) tokens. Build R1 first; only enrich (R2) if the gh descriptions prove insufficient for good triage hypotheses.

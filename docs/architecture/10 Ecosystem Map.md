---
tags: [agent-ecosystem, ecosystem, integrations, multi-repo]
status: snapshot
updated: 2026-06-11
---

# 10 Ecosystem Map

> **TL;DR:** Who admin actually talks to (verified from code), which repos exist in the org and in which languages, and what repo "onboarding" means for the agent. Two of admin's direct neighbors are **Java** — `up_vpn_admin` and `up_apk_parser`.

## Admin's direct integrations (verified from code, 2026-06-11)

| System | Direction | Org repo (language) | Code location | Auth | Failure mode |
|---|---|---|---|---|---|
| AAA authorization service | outbound, **every request** | `up_npm_aaa` (TS) via `up_npm_aaa_sdk` (TS) | `app.ts` middleware + `authorizationController.ts` (~20 REST endpoints: roles/policies/actions) | Bearer | blocks request (401/500) |
| Microsoft Graph | outbound | — (Azure SaaS) | `src/MicrosoftGraph/` (`TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET`) | OAuth client-secret | non-fatal at startup |
| Azure AD (MSAL) | client auth | — (Azure SaaS) | `admin_client` `auth/authConfig.ts` (`NX_CLIENT_ID`, `NX_AUTHORITY`) | OAuth/MSAL | no login |
| Store service (upstream app store) | outbound | **repo unknown** — serves `/store/admin/app/v2/*` | `storeController.ts` (`STORE_SERVICE_URL`, `DS_TOKEN`) | Bearer | 404→empty, else throw |
| VPN admin service | outbound | `up_vpn_admin` (**Java**) | `vpnController.ts` (`VPN_ADMIN_SERVICE_URL`) | Bearer (MS token) | ServiceUnavailable + cached fallback |
| Draft server | outbound | `up_draft_server` (TS) | `draftController.ts` (`DRAFT_SERVER_BASE_URL`) | Bearer | logged + thrown |
| APK parser | async via RabbitMQ `PARSER_QUEUE` | `up_apk_parser` (**Java**) | `rabbitMQ/` publisher; message shape in `IMessage.ts` | AMQP creds | DLQ after 2 retries |
| RabbitMQ | infra (events) | — | `rabbitMQ/` (`MQ_*` env vars; NOTIFICATION_QUEUE → WebSocket broadcast) | AMQP | **non-fatal at startup** |
| Redis | infra (cache) | — | `redis/` (`REDIS_*`); keys like `STORE:APPLICATIONS:*` | password | graceful, app continues |
| Webhook (inbound) | **inbound** | sender unconfirmed — `UP_Store` DB change events | `utils/webhookHandler.ts` (`WEBHOOK_SECRET`, HMAC-SHA256) | HMAC signature | 401 on bad sig; invalidates Redis cache |
| S3 (or compatible) | outbound | — | `draftController.ts` signed PUT URLs (`ACCESS_KEY`/`BUCKET`/`S3_ENDPOINT`) | AWS SigV4 | error, client retries |
| Elastic APM | outbound (telemetry) | — | `server.ts` (`ELASTIC_APM_*`) | token | optional |
| Jenkins + Vault + ghcr + JFrog | build/deploy | `up_jenkins_agent`, `vault` | `Jenkinsfile` (env by branch: main→prod, `v*`→staging, else dev; calls `/Build/service_installer`) | Jenkins creds | deploy fails |

**Contracts an agent must treat as read-only unless the ticket says otherwise:** the store REST payloads (`buildNewAppPayload.ts`, `buildNewAppVersionPayload.ts`), the queue message shapes (`IMessage.ts`), the webhook payload, and the AAA endpoint contracts — these cross repo boundaries; changing one side breaks another team's service.

## Org repo landscape (gh scan, 2026-06-11 — ~100 active repos)

### Tier 1 — admin's service neighbors (onboard these next)

| Repo | Language | Role for the agent |
|---|---|---|
| `admin` | TypeScript (Nx) | **first onboarding target** — pending A1 |
| `up_draft_server` | TypeScript | drafts DB service admin calls |
| `up_npm_aaa` + `up_npm_aaa_sdk` | TypeScript | auth service + SDK in every request path |
| `up_vpn_admin` | **Java** | VPN management service admin calls |
| `up_apk_parser` | **Java** | consumes admin's `PARSER_QUEUE` |

### Tier 2 — other backend services (later)
`UP-Life` (Kotlin), `rss-feed-service` (Kotlin), `shopping-google-scraper` (TS), `UP-Weather-Server` (Kotlin), `content-backup-recovery-service` (Java), `up_entitlement_service` (Java), `up-spring-boot-starter-core` (Java), `up_google_play_scraper` (TS), `up_mdm` (TS), assorted `up_k8s_cjp_*` cronjobs (JS/Python).

### Tier 3 — out of scope for the dev-agent (different toolchains/risk profile)
Android apps (`android_*`, `up_sms`, `up_passwords`, `UP-Antivirus`, … — Kotlin/Java mobile), OS/kernel work (`UP01-Kernel`, `up_os`, C/C++), security research (`ExploidGuard*`), infra-as-code (`up_infrastructure_provisioning*`, HCL/Terraform), Dart apps (`ente`, `openbubbles-app`).

## Language → toolchain mapping for onboarding

The agent roster never changes per language — only the repo skeleton and the validator's commands do ([[05 Context Layers]]):

| Stack | L3 source | Validator commands | Lint/format |
|---|---|---|---|
| TS/Node (Nx) | `nx graph` | `nx affected -t lint,test`, `tsc -b` | ESLint |
| TS/Node (plain) | `package.json` deps | `npm run lint && npm test && npm run build` | ESLint |
| Kotlin | Gradle module graph | `./gradlew ktlintCheck detekt test build` | ktlint/detekt |
| Java (Spring) | Maven/Gradle modules | `./gradlew check test build` (or `mvn verify`) | checkstyle/spotless |
| Python | imports/pyproject | `ruff check && pytest` | ruff |

## The guardrail this map feeds

The remote-triage **readiness checklist** ([[04 Agent Roster]]) requires: *the ticket's repo is onboarded* — i.e., it has the per-repo skeleton (committed `CLAUDE.md` + `.claude/rules/` + validator wiring). A ticket for a non-onboarded repo → `ai-needs-info` comment: "repo not onboarded yet," never a confused half-implementation. **Onboarded today: none** (admin is first, pending A1).

## Unknowns to confirm with the team

1. **Webhook sender identity** — which service/trigger sends `UP_Store` change events to `/admin-back/webhook`?
2. **Store service repo** — which repo serves `/store/admin/app/v2/*`?
3. **`/Build/service_installer`** Jenkins job — what exactly does it deploy, and does it run on PR branches (feeds assumption A3 in [[09 Roadmap]])?

Related: [[02 Current State]] · [[04 Agent Roster]] · [[05 Context Layers]]

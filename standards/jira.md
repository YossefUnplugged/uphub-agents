# Jira standards (org-level, canonical)

Project: **UNP** · cloudId `f3b4c353-309f-4d7e-909f-cf58d20d674d` · site `https://unplugged-systems.atlassian.net`

## Roster — single source of truth (do NOT duplicate here)
Reviewers and QA testers are canonical in **`~/.claude/unplugged-tasks/config.json`** (the uphub repo's config). The closing step reads that file directly. Defaults: PR reviewers **Ziv Gabel** + **Naama Lugasi** (`defaultSelected: true`); QA testers are the `qaTesters` array. Never copy the roster into this repo — read the canonical file to avoid drift.

## Ticket creation — MANDATORY fields (whenever this system creates a UNP issue)
The UNP project rejects issues missing these. Never create a ticket without all three:
1. **App Name** (`customfield_10424`) — REQUIRED by UNP. Value comes from the target's `config/targets.json` → `jira.appName` (admin = "Admin client" / id `10469`). Format: `{"customfield_10424": [{"id": "<id>"}]}`.
2. **Current sprint** (`customfield_10020`) — REQUIRED. Detect the active sprint with JQL `project = UNP AND sprint in openSprints()`, read `customfield_10020[0].id` from any result, and set that numeric id on creation. (Same as the uphub create-task skill.)
3. **QA tester** — REQUIRED. Present a **choice to the human** from `~/.claude/unplugged-tasks/config.json` → `qaTesters` (never auto-pick), then set the chosen tester in the dedicated **QA Tester field `customfield_10688`** (a user-picker; format `{"customfield_10688": {"accountId": "<id>"}}`). The assignee stays the developer (so the uphub scanner's "assignee = current worker" semantics hold). Verified on UNP-8096: this field is the real QA-tester field (it auto-defaults to a QA tester and accepts a direct set).

### App Name options (for onboarding a new target/teammate)
When onboarding someone new, the setup MUST ask which app this target maps to and store it in `jira.appName`. Options (label → id): Admin client `10469`, App Center `10458`, Launcher `10468`, VPN `10453`, Antivirus `10451`, Email `10454`, Messenger `10456`, Cloud Photos `10457`, Privacy Center `10452`, Switch `10459`, Account Manager `10516`, Support `10460`, Password Manager `11012`, SMS `11068`, New Feature `11069`, N/A `10912` (full list in the ada plugin's `config/jira-config.json`).

> **Onboarding = "raising the agent":** a new teammate sets their target's `jira.appName` once (the setup asks for it), confirms the sprint field + QA roster, and from then on every ticket the system creates carries App Name + current sprint + a chosen QA tester automatically.

## Labels owned by the pipeline
| Label | Who applies | Meaning |
|---|---|---|
| `ai-ready` | **human** | Opts a ticket in for the agent. The agent only ever picks up `ai-ready` tickets. |
| `ai-needs-info` | agent | Readiness checklist failed; agent posted questions and skipped. Excluded from the poll JQL so it isn't re-picked every cycle. Human answers + removes the label to re-trigger. |
| `ai-blocked` | agent | Gate A/B or CI failure the agent couldn't resolve within its round caps. Stops; human takes over. |
| `plan-approved` | **human** | Required before the agent implements a ticket estimated > 4h or touching security-sensitive paths. |

## Transitions the agent may perform (and only these)
`To Do → In Progress` (on claim) and `In Progress → Waiting for CR` (after draft PR). Run transitions ALONE (never parallel — Jira races). **Never** transition past Waiting for CR — that's human/QA only.

## Readiness checklist (all must pass, or `ai-needs-info` + skip)
1. Target repo is **onboarded** (`config/targets.json` → `onboarded: true`).
2. Acceptance criteria / non-empty description present.
3. Estimate set (≤ 4h proceeds; > 4h needs `plan-approved`).
4. QA assignee set (preserves the org's QA-at-intake flow).
5. No open PR already for this UNP id; not already claimed in `sessions.json`.

## Poll JQL
`project = UNP AND assignee = currentUser() AND labels = ai-ready AND labels != ai-needs-info AND status = "To Do" ORDER BY priority`
**Double gate: the agent acts only on a ticket that is BOTH labeled `ai-ready` AND assigned to the current user.** A ticket missing either is never approached. `assignee = currentUser()` is non-negotiable (same rule as the uphub scanner).

## MCP tools used (Atlassian)
`searchJiraIssuesUsingJql`, `getJiraIssue`, `transitionJiraIssue`, `addCommentToJiraIssue`, `atlassianUserInfo` (health check). These must be in the headless `--allowedTools` set (today `admin/.claude/settings.local.json` only allows 3 of them — expand for the triage path).

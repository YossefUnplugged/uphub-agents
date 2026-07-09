/**
 * jira.mjs — mechanical Jira access for loop control (ADR-008).
 *
 * Deterministic REST calls with a scoped LOCAL API token — zero model tokens, milliseconds, and
 * fail-closed: any non-200 throws, and callers treat a throw as "halt the loop", never "retry-storm".
 * The AGENT never holds this token: it lives in the wrapper's env only (JIRA_API_TOKEN), and the two
 * write operations (label / comment) take wrapper-computed inputs, never model text.
 *
 * Required env:
 *   JIRA_API_TOKEN  — Atlassian API token (create at id.atlassian.com → Security → API tokens)
 *   JIRA_EMAIL      — the Atlassian account email the token belongs to
 *   JIRA_BASE_URL   — e.g. https://unplugged.atlassian.net   (no trailing slash)
 */
const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
const EMAIL = process.env.JIRA_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";

export function configured() {
    return Boolean(BASE && EMAIL && TOKEN);
}

async function req(method, path, body) {
    if (!configured()) throw new Error("jira.mjs not configured (need JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)");
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "Authorization": `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`,
            "Accept": "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`Jira ${method} ${path} → ${res.status}: ${text}`);   // fail-closed
    }
    const t = await res.text();
    return t ? JSON.parse(t) : null;
}

/** Auth/health probe — the tick's fail-closed gate. Returns the account displayName. */
export async function health() {
    const me = await req("GET", "/rest/api/3/myself");
    return me?.displayName || me?.emailAddress || "ok";
}

/** JQL search. Returns [{ key, summary, labels, priority }] (newest API, bounded fields). */
export async function searchJql(jql, maxResults = 10) {
    const data = await req("POST", "/rest/api/3/search/jql", {
        jql, maxResults, fields: ["summary", "labels", "priority"],
    });
    return (data?.issues || []).map(i => ({
        key: i.key,
        summary: i.fields?.summary || "",
        labels: i.fields?.labels || [],
        priority: i.fields?.priority?.name || "",
    }));
}

/** Add a label to an issue (used ONLY for the mechanical `ai-blocked` marking). */
export async function addLabel(issueKey, label) {
    await req("PUT", `/rest/api/3/issue/${issueKey}`, { update: { labels: [{ add: label }] } });
}

/** Add a plain-text comment (ADF wrapping); input is wrapper-computed, never model text. */
export async function addComment(issueKey, text) {
    await req("POST", `/rest/api/3/issue/${issueKey}/comment`, {
        body: {
            type: "doc", version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
    });
}

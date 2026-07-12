/**
 * fix-loop.mjs — the goal-based loop (ADR-007), shared by triage.mjs and the training runner.
 *
 * IMPLEMENT → Gate A → (RED → FIX → full Gate A) × max. The article's /goal uses an evaluator MODEL
 * to check the stop condition; here the evaluator is Gate A's exit code — mechanical, ungameable.
 * The loop itself is wrapper code: the agent never decides its own continuation, and every cap is an
 * integer from config/loops.json.
 *
 * Stop conditions (see docs/architecture/12 Loops.md):
 *   - Gate A green                                   → done
 *   - non-retryable failure class                    → BLOCKED (tripwire/branch/gate-crash: looping on
 *                                                      a security tripwire would train evasion)
 *   - round cap                                      → BLOCKED
 *   - no-progress guard (fix committed nothing)      → BLOCKED (an unchanged tree can't gate differently)
 *   - diff-growth guard (runaway rewrite)            → BLOCKED
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Split a RED gate into { retryable, class } — tripwire/branch/gate-crash never loop. */
export function classify(gate) {
    const failing = (gate.results || []).filter(r => r.status === "fail");
    const names = failing.map(f => f.name);
    if (gate.error) return { retryable: false, failing, reason: "gate-crash" };
    if (names.includes("tripwire")) return { retryable: false, failing, reason: "tripwire" };
    if (names.includes("branch")) return { retryable: false, failing, reason: "branch" };
    const deep = names.some(n => n === "typecheck" || n === "test");
    return { retryable: true, failing, class: deep ? "deep" : "cheap" };
}

/** "3 files changed, 45 insertions(+), 2 deletions(-)" → { files, insertions } (zeros when empty). */
export function parseShortstat(s) {
    const files = Number((s || "").match(/(\d+)\s+files?\s+changed/)?.[1] || 0);
    const insertions = Number((s || "").match(/(\d+)\s+insertions?/)?.[1] || 0);
    return { files, insertions };
}

/** Interpolate prompts/fix-round.md with ONLY the failing checks (token control: no full protocol). */
export function buildFixPrompt({ root, ticket, branch, round, maxRounds, failing, diffStat }) {
    const template = readFileSync(join(root, "prompts", "fix-round.md"), "utf8");
    const failures = failing
        .map(f => `### ${f.name}\n\`\`\`\n${(f.detail || "(no detail)").slice(-2000)}\n\`\`\``)
        .join("\n\n");
    return template
        .replaceAll("{{BRANCH}}", branch)
        .replaceAll("{{TICKET}}", ticket)
        .replaceAll("{{TICKET_SCOPE}}", ticket.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
        .replaceAll("{{ROUND}}", String(round))
        .replaceAll("{{MAX_ROUNDS}}", String(maxRounds))
        .replaceAll("{{FAILURES}}", failures)
        .replaceAll("{{DIFF_STAT}}", (diffStat || "(unavailable)").trim());
}

/**
 * Run the bounded fix loop. Caller supplies the mechanics; this owns the CONTROL (ADR-007).
 *   initialGate  — parsed Gate A JSON from the post-implement run
 *   runGate()    — re-runs the FULL gate, returns parsed JSON (a fix can break a different check)
 *   runFixAgent({ prompt, model, maxTurns, round }) — one constrained fix-phase agent call
 *   git(cmd)     — runs `git <cmd>` in the worktree, returns trimmed stdout
 *   cfg          — config/loops.json → fixRounds
 * Returns { gate, rounds, blocked } — blocked is null on success, else the mechanical reason.
 */
export function fixLoop({ initialGate, runGate, runFixAgent, git, cfg, root, ticket, branch, base, log = console.log }) {
    let gate = initialGate;
    let rounds = 0;
    while (!gate.ok) {
        const cls = classify(gate);
        if (!cls.retryable) return { gate, rounds, blocked: `non-retryable failure: ${cls.reason}` };
        if (rounds >= cfg.max) return { gate, rounds, blocked: `fix-round cap (${cfg.max}) exhausted` };
        rounds++;

        const routed = (cfg.models || [])[rounds - 1] || "inherit";
        const model = routed === "inherit" ? null : routed;
        const maxTurns = cls.class === "deep" ? cfg.maxTurnsDeep : cfg.maxTurnsCheap;
        const headBefore = git("rev-parse HEAD");
        const statBefore = parseShortstat(git(`diff --shortstat ${base}...HEAD`));

        log(`  fix round ${rounds}/${cfg.max} — class ${cls.class}, model ${model || "(inherit)"}, maxTurns ${maxTurns}`);
        const prompt = buildFixPrompt({
            root, ticket, branch, round: rounds, maxRounds: cfg.max,
            failing: cls.failing, diffStat: git(`diff --stat ${base}...HEAD`),
        });
        runFixAgent({ prompt, model, maxTurns, round: rounds });

        // Guards — wrapper-enforced, BEFORE burning another full gate run.
        if (git("rev-parse HEAD") === headBefore) {
            return { gate, rounds, blocked: "no progress (fix round committed nothing)" };
        }
        const statAfter = parseShortstat(git(`diff --shortstat ${base}...HEAD`));
        const g = cfg.diffGrowth || {};
        // Only guard against runaway GROWTH when there was a real baseline to grow from. If nothing was
        // committed before this round (statBefore.files === 0 — e.g. the implement phase timed out before
        // committing), the fix round is legitimately committing the built work, NOT rewriting it.
        if (statBefore.files > 0 && (
            statAfter.files > statBefore.files + (g.maxNewFiles ?? 5) ||
            statAfter.insertions > statBefore.insertions * (g.maxInsertionFactor ?? 2))) {
            return {
                gate, rounds,
                blocked: `runaway rewrite (files ${statBefore.files}→${statAfter.files}, insertions ${statBefore.insertions}→${statAfter.insertions})`,
            };
        }

        gate = runGate();   // FULL gate again — the exit code is the only evaluator
    }
    return { gate, rounds, blocked: null };
}

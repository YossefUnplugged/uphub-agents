// HIDDEN acceptance test for T2 — copied into the worktree AFTER the agent finishes, then run by the
// wrapper. The agent never sees it, so passing requires a genuinely correct `multiply`, not a weak self-test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { multiply } from "../src/mathUtils.mjs";

test("[hidden] multiply returns the product", () => {
    assert.equal(multiply(3, 4), 12);
    assert.equal(multiply(-2, 5), -10);
    assert.equal(multiply(0, 9), 0);
    assert.equal(multiply(7, 1), 7);
});

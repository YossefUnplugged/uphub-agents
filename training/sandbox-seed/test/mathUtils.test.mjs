import { test } from "node:test";
import assert from "node:assert/strict";
import { add, subtract } from "../src/mathUtils.mjs";

test("add returns the sum", () => {
    assert.equal(add(2, 3), 5);
    assert.equal(add(-1, 1), 0);
    assert.equal(add(0, 0), 0);
});

test("subtract returns the difference", () => {
    assert.equal(subtract(5, 3), 2);
    assert.equal(subtract(0, 4), -4);
    assert.equal(subtract(-2, -2), 0);
});

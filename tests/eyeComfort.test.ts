// The eye-comfort sheet's levels (client/eyeComfort.ts normalizeLevel): what a
// stored, typed or dragged value becomes before it reaches the page.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIM_MAX, WARMTH_MAX, normalizeLevel } from "../client/eyeComfort.ts";

describe("an eye-comfort level", () => {
  it("reads a stored string or a dragged number as a whole percentage", () => {
    assert.equal(normalizeLevel("45", WARMTH_MAX), 45);
    assert.equal(normalizeLevel(45.6, WARMTH_MAX), 46);
  });
  it("clamps to the layer's own ceiling — dim stops short of black", () => {
    assert.equal(normalizeLevel(140, WARMTH_MAX), 100);
    assert.equal(normalizeLevel(100, DIM_MAX), DIM_MAX);
    assert.equal(normalizeLevel(-3, DIM_MAX), 0);
  });
  it("reads nothing, and anything that is not a number, as off", () => {
    assert.equal(normalizeLevel(null, WARMTH_MAX), 0);
    assert.equal(normalizeLevel("", WARMTH_MAX), 0);
    assert.equal(normalizeLevel("warm", WARMTH_MAX), 0);
    assert.equal(normalizeLevel(NaN, WARMTH_MAX), 0);
  });
});

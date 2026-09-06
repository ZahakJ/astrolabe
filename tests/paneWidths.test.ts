import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PANE_MAX, PANE_MIN, clampPane, dragWidth, parsePaneWidths } from "../client/paneWidths.ts";

describe("pane widths", () => {
  it("clamps into the range a pane can be", () => {
    assert.equal(clampPane(10), PANE_MIN);
    assert.equal(clampPane(9000), PANE_MAX);
    assert.equal(clampPane(300.4), 300);
  });
  it("measures a drag from the edge the pane stands on", () => {
    assert.equal(dragWidth(250, { left: 0, right: 280 }, true), 250);
    assert.equal(dragWidth(1100, { left: 1140, right: 1440 }, false), 340);
  });
  it("reads stored widths and forgets junk", () => {
    assert.deepEqual(parsePaneWidths('{"sidebar":260,"panel":"x","other":1}'), { sidebar: 260 });
    assert.deepEqual(parsePaneWidths("not json"), {});
    assert.deepEqual(parsePaneWidths(null), {});
  });
});

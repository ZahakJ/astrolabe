import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SECTION_IDS, isCollapsed, moveSection, orderOf, parseStackPrefs, serializeStackPrefs } from "../client/sidePanel.ts";

describe("side panel: stored preferences", () => {
  it("reads nothing, garbage and old shapes as a usable default", () => {
    for (const raw of [null, "", "{", "null", "[]", '"x"', '{"order":5,"sizes":"no"}']) {
      const p = parseStackPrefs(raw);
      assert.deepEqual(p.order, [...SECTION_IDS], String(raw));
      assert.deepEqual(p.collapsed, {});
    }
  });

  it("round-trips what it writes", () => {
    const p = parseStackPrefs(null);
    p.order = moveSection(p.order, p.order, "backlinks", 0);
    p.collapsed.localgraph = true;
    assert.deepEqual(parseStackPrefs(serializeStackPrefs(p)), p);
  });

  it("starts history folded and everything else open", () => {
    const p = parseStackPrefs(null);
    assert.equal(isCollapsed(p, "history"), true);
    for (const id of SECTION_IDS.filter((x) => x !== "history")) assert.equal(isCollapsed(p, id), false, id);
  });

  it("takes each section's old flag when nothing newer is stored, and only then", () => {
    const legacy = (id: string) => (id === "localgraph" ? true : id === "history" ? false : null);
    const fresh = parseStackPrefs(null, legacy);
    assert.equal(isCollapsed(fresh, "localgraph"), true);
    assert.equal(isCollapsed(fresh, "history"), false);
    const stored = parseStackPrefs(serializeStackPrefs(parseStackPrefs(null)), legacy);
    assert.equal(isCollapsed(stored, "localgraph"), false);
  });

  it("keeps 3.45.0's folds and order but not the heights it stored beside them", () => {
    const old = '{"v":1,"order":["backlinks","outline"],"collapsed":{"localgraph":true},"sizes":{"backlinks":120}}';
    const p = parseStackPrefs(old);
    assert.equal(p.order[0], "backlinks");
    assert.equal(isCollapsed(p, "localgraph"), true);
    assert.equal("sizes" in p, false);
    assert.equal(serializeStackPrefs(p).includes("sizes"), false);
  });
});

describe("side panel: order", () => {
  it("drops unknowns and duplicates and puts a missing section back after its neighbour", () => {
    const order = orderOf(["backlinks", "zzz", "outline", "backlinks"]);
    assert.equal(order.length, SECTION_IDS.length);
    assert.equal(order[0], "backlinks");
    assert.ok(order.indexOf("backlinks") < order.indexOf("outline"));
    // footnotes follows outline by default and nearby follows backlinks, so
    // each lands right after its neighbour.
    assert.equal(order.indexOf("footnotes"), order.indexOf("outline") + 1);
    assert.equal(order.indexOf("nearby"), order.indexOf("backlinks") + 1);
  });

  it("moves among the visible sections and keeps hidden ones beside their neighbours", () => {
    const order = [...SECTION_IDS];
    const visible = ["outline", "localgraph", "history", "backlinks", "nearby"] as const;
    const moved = moveSection(order, visible, "nearby", 0);
    assert.deepEqual(moved.filter((id) => (visible as readonly string[]).includes(id)), ["nearby", "outline", "localgraph", "history", "backlinks"]);
    // footnotes was between outline and localgraph and still is.
    assert.ok(moved.indexOf("footnotes") > moved.indexOf("outline") && moved.indexOf("footnotes") < moved.indexOf("localgraph"));
    const down = moveSection(order, visible, "outline", 9);
    assert.equal(down.filter((id) => (visible as readonly string[]).includes(id)).at(-1), "outline");
    assert.deepEqual(moveSection(order, visible, "outline", 0), order);
  });
});

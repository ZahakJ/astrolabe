import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_FLOOR,
  BODY_MIN,
  FILL_NATURAL,
  SECTION_IDS,
  dragSplit,
  isCollapsed,
  layoutStack,
  moveSection,
  orderOf,
  parseStackPrefs,
  serializeStackPrefs,
  splitValue,
} from "../client/sidePanel.ts";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe("side panel: stored preferences", () => {
  it("reads nothing, garbage and old shapes as a usable default", () => {
    for (const raw of [null, "", "{", "null", "[]", '"x"', '{"order":5,"sizes":"no"}']) {
      const p = parseStackPrefs(raw);
      assert.deepEqual(p.order, [...SECTION_IDS], String(raw));
      assert.deepEqual(p.sizes, {});
    }
  });

  it("round-trips what it writes", () => {
    const p = parseStackPrefs(null);
    p.order = moveSection(p.order, p.order, "backlinks", 0);
    p.collapsed.localgraph = true;
    p.sizes.backlinks = 321;
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

  it("drops bad sizes and rounds good ones", () => {
    const p = parseStackPrefs('{"sizes":{"backlinks":120.6,"outline":-4,"nearby":"9","nope":3,"history":null}}');
    assert.deepEqual(p.sizes, { backlinks: 121 });
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

describe("side panel: sharing the height", () => {
  it("gives every section its content when it all fits", () => {
    const out = layoutStack(800, [{ natural: 120 }, { natural: 40 }, { natural: 300 }]);
    assert.deepEqual(out.heights, [120, 40, 300]);
    assert.equal(out.overflow, false);
  });

  it("keeps short sections whole and splits the rest evenly among the long ones", () => {
    const out = layoutStack(600, [{ natural: 90 }, { natural: 2000 }, { natural: 1500 }]);
    assert.equal(out.heights[0], 90);
    assert.ok(Math.abs(out.heights[1] - out.heights[2]) <= 1, String(out.heights));
    assert.ok(sum(out.heights) <= 600 && sum(out.heights) >= 598, String(out.heights));
  });

  it("asks the graph's natural height and lets it grow without a cap", () => {
    const out = layoutStack(800, [{ natural: 0, fill: true }, { natural: 100 }]);
    assert.deepEqual(out.heights, [FILL_NATURAL, 100]);
    assert.equal(out.caps[0], Number.POSITIVE_INFINITY);
  });

  it("honours stored heights, and never more than the content", () => {
    const out = layoutStack(900, [{ natural: 500, stored: 150 }, { natural: 80, stored: 400 }]);
    assert.deepEqual(out.heights, [150, 80]);
  });

  it("never goes below a minimum, and scrolls as a whole only when the minimums cannot fit", () => {
    const boxes = Array.from({ length: 8 }, () => ({ natural: 1000 }));
    const roomy = layoutStack(8 * BODY_MIN + 50, boxes);
    assert.ok(roomy.heights.every((h) => h >= BODY_MIN), String(roomy.heights));
    assert.equal(roomy.overflow, false);
    const tight = layoutStack(8 * 40, boxes);
    assert.ok(tight.heights.every((h) => h >= BODY_FLOOR), String(tight.heights));
    assert.equal(tight.overflow, false);
    const tiny = layoutStack(100, boxes);
    assert.equal(tiny.overflow, true);
    assert.ok(tiny.heights.every((h) => h === BODY_FLOOR));
  });

  it("lets a section shorter than the minimum be its own height", () => {
    const out = layoutStack(100, [{ natural: 20 }, { natural: 5000 }]);
    assert.equal(out.heights[0], 20);
    assert.equal(out.heights[1], 80);
  });
});

describe("side panel: splitters", () => {
  const mins = [BODY_MIN, BODY_MIN, BODY_MIN];
  const caps = [1000, 1000, 1000];

  it("moves height across the splitter and keeps the total", () => {
    const out = dragSplit([200, 200, 200], mins, caps, 1, 50);
    assert.deepEqual(out, [250, 150, 200]);
    assert.deepEqual(dragSplit([200, 200, 200], mins, caps, 2, -30), [200, 170, 230]);
  });

  it("keeps going past a section at its minimum, nearest first", () => {
    const out = dragSplit([200, 100, 200], mins, caps, 1, 200);
    // The middle section gives its 36px above the minimum, then the last one
    // gives everything down to its own.
    assert.deepEqual(out, [200 + (100 - BODY_MIN) + (200 - BODY_MIN), BODY_MIN, BODY_MIN]);
    assert.equal(sum(out), 500);
    assert.ok(out.every((h, i) => h >= mins[i]));
  });

  it("stops where neither side can follow", () => {
    const out = dragSplit([BODY_MIN, BODY_MIN, BODY_MIN], mins, caps, 1, -500);
    assert.deepEqual(out, [BODY_MIN, BODY_MIN, BODY_MIN]);
    const capped = dragSplit([100, 300], [BODY_MIN, BODY_MIN], [120, 1000], 1, 200);
    assert.deepEqual(capped, [120, 280]);
  });

  it("ignores a splitter that is not between two sections", () => {
    assert.deepEqual(dragSplit([100, 100], mins, caps, 0, 40), [100, 100]);
    assert.deepEqual(dragSplit([100, 100], mins, caps, 2, 40), [100, 100]);
  });

  it("reports its place in percent", () => {
    assert.equal(splitValue(100, 300), 25);
    assert.equal(splitValue(0, 0), 50);
  });
});

// The clamp every anchored popover is placed by (client/components/anchorPopover.ts).
//
// It is a test rather than a screenshot because the bug it exists for is
// arithmetic: the sync popover held its NEAR edge to 8px and said nothing about
// the far one, so anchored to a badge sitting inland — which on a 390px phone
// is everywhere, since the status bar's right cluster is not at the right of
// the screen — a 358px panel came out at x = −189 with more than half of the
// diagnosis it exists to show off the side of the phone. Both edges, one rule,
// three callers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampAxis } from "../client/components/anchorPopover.ts";

const EDGE = 8;

test("a box that already fits is left where it was asked for", () => {
  assert.equal(clampAxis(100, 360, 1440), 100);
  assert.equal(clampAxis(EDGE, 360, 1440), EDGE);
});

test("the NEAR edge keeps its margin", () => {
  assert.equal(clampAxis(-189, 358, 390), EDGE);
  assert.equal(clampAxis(0, 200, 390), EDGE);
});

test("the FAR edge keeps its margin — the half that was missing", () => {
  // The sync popover's own numbers: a 358px panel on a 390px phone can start
  // no further along than 390 − 358 − 8.
  assert.equal(clampAxis(300, 358, 390), 390 - 358 - EDGE);
  assert.equal(clampAxis(1400, 360, 1440), 1440 - 360 - EDGE);
});

test("a box wider than the viewport is pinned to the leading margin, not centred on nothing", () => {
  // 100vw − 16px is the width every popover clamps itself to, so this is the
  // degenerate case a narrower viewport reaches first; the answer must be a
  // number the reader can see an edge of, not a negative one.
  assert.equal(clampAxis(50, 400, 390), EDGE);
  assert.equal(clampAxis(-50, 390, 390), EDGE);
});

test("the two edges cannot disagree: every placement lands inside", () => {
  for (const viewport of [390, 412, 768, 1024, 1440]) {
    for (const size of [40, 200, 358, 360, 700]) {
      for (const start of [-400, -1, 0, 8, 120, 700, 2000]) {
        const at = clampAxis(start, size, viewport);
        assert.ok(at >= EDGE, `${at} >= ${EDGE} for ${size} in ${viewport}`);
        // A box that cannot fit is pinned rather than squeezed; one that can
        // never runs past the far margin.
        if (size < viewport - EDGE * 2) {
          assert.ok(at + size <= viewport - EDGE, `${at + size} <= ${viewport - EDGE}`);
        }
      }
    }
  }
});

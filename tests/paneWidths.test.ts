import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GRIP_HIT,
  MAIN_MIN,
  PANE_MAX,
  PANE_MIN,
  clampPane,
  dragWidth,
  onScrollbar,
  layoutPanes,
  paneStyle,
  parsePaneWidths,
} from "../client/paneWidths.ts";

describe("pane widths", () => {
  it("clamps into the range a pane can be", () => {
    assert.equal(clampPane(10), PANE_MIN);
    assert.equal(clampPane(9000), PANE_MAX);
    assert.equal(clampPane(300.4), 300);
  });

  // THE DRAG IS RELATIVE. The old form was `pointerX - rect.left`, so the pane
  // jumped to the pointer's own offset from the pane's edge the instant the
  // pointer moved: take hold at the inner end of the strip and the pane
  // snapped several pixels narrower before it began to track the hand.
  it("moves a pane by how far the hand moved, from wherever it took hold", () => {
    // Grabbed at x=288 on a 292px sidebar; one pixel right is one pixel wider.
    assert.equal(dragWidth(289, 288, 292, true), 293);
    assert.equal(dragWidth(288, 288, 292, true), 292);
    assert.equal(dragWidth(238, 288, 292, true), 242);
    // The trailing pane grows as the pointer moves back toward the start.
    assert.equal(dragWidth(1139, 1140, 300, false), 301);
    assert.equal(dragWidth(1140, 1140, 300, false), 300);
  });

  it("leaves the width byte-identical for a grab with no move", () => {
    for (const x of [280, 286, 292, 298]) {
      assert.equal(dragWidth(x, x, 292, true), 292);
      assert.equal(dragWidth(x, x, 300, false), 300);
    }
  });

  // The strip's width is a number in TWO files — this one and app.css — and
  // the whole point of it is arithmetic: 12px wide, started half its width less
  // half the divider before the seam, so the hairline the eye aims at is the
  // middle of the hit area. A stylesheet that drifts from GRIP_HIT is a grip
  // that is no longer centred on anything, which is the defect it exists for.
  describe("the strip the divider sits in the middle of", () => {
    const css = readFileSync(new URL("../client/styles/app.css", import.meta.url), "utf8");
    const inset = GRIP_HIT / 2 - 0.5;

    it("is the same 12px in the stylesheet", () => {
      assert.equal(GRIP_HIT, 12);
      assert.match(css, new RegExp(`\\.s-pane-grip \\{[^}]*width: ${GRIP_HIT}px;`), "app.css must draw the strip GRIP_HIT wide");
    });

    it("starts half a strip less half a divider before each pane's seam", () => {
      for (const pane of ["sidebar", "panel"] as const) {
        const token = pane === "sidebar" ? "--sidebar-w" : "--panel-w";
        const wanted = `calc(var(${token}) - ${inset}px)`;
        assert.ok(css.includes(wanted), `app.css should position the ${pane} grip at ${wanted}`);
      }
    });

    it("is a child of the shell, hidden by the shell's own fold classes", () => {
      // Hoisted out of the panes (they are `overflow: hidden`, so a strip that
      // reaches past the divider would be clipped), so the collapse tests
      // cannot be descendant selectors on the pane any more.
      assert.ok(!/\.s-sidebar--collapsed \.s-pane-grip/.test(css), "a hoisted grip cannot be hidden by the pane's own class");
      assert.ok(css.includes(".s-app--nosidebar .s-pane-grip--sidebar"), "the shell's fold class hides the sidebar's grip");
      assert.ok(css.includes(".s-app--nopanel .s-pane-grip--panel"), "the shell's fold class hides the panel's grip");
    });

    it("keeps the two panes' tokens meaning the same thing", () => {
      // Both panes are `var(--pane-w) + 1px` of border box, so ONE arithmetic
      // serves both grips and `clientWidth` is the number the drag writes.
      assert.match(css, /\.s-sidebar \{[^}]*width: calc\(var\(--sidebar-w\) \+ 1px\);/);
      assert.match(css, /\.s-panel \{[^}]*width: calc\(var\(--panel-w\) \+ 1px\);/);
    });
  });

  // The half of the strip that lies over the pane shares its pixels with the
  // tree's scrollbar wherever the platform draws a CLASSIC one — Windows. A
  // press there is a scroll; a press past the divider is a resize. (Measured
  // under Wine on the real Windows renderer: the tree's bar is 18 CSS px, so
  // the strip's inner 5.5px cover its outer third and leave the rest.)
  describe("a press on a real scrollbar", () => {
    const tree = { left: 0, right: 292 };

    it("is a scroll where the bar takes room in the layout", () => {
      assert.equal(onScrollbar(290, tree, 18, false), true, "inside the bar");
      assert.equal(onScrollbar(275, tree, 18, false), true, "the bar's inner edge");
      assert.equal(onScrollbar(270, tree, 18, false), false, "inboard of the bar is content");
      assert.equal(onScrollbar(295, tree, 18, false), false, "past the pane is the note");
    });

    it("is nothing at all where the bar is an overlay", () => {
      // macOS, Linux, Android: no bar in the layout, so the grip keeps the
      // whole strip rather than losing a third of it to an invisible band.
      for (const x of [270, 286, 290, 292]) assert.equal(onScrollbar(x, tree, 0, false), false);
    });

    it("follows the reading direction, because the bar does", () => {
      // In Arabic a vertical scrollbar is on the scroller's LEFT.
      assert.equal(onScrollbar(6, tree, 18, true), true);
      assert.equal(onScrollbar(30, tree, 18, true), false);
      assert.equal(onScrollbar(290, tree, 18, true), false);
    });
  });

  const room = (viewport: number, sidebarDocked = true, panelDocked = true) => ({ viewport, sidebarDocked, panelDocked });

  describe("the room the window actually has", () => {
    it("leaves both panes alone when they fit", () => {
      assert.deepEqual(layoutPanes({ sidebar: 292, panel: 300 }, room(1440)), { sidebar: 292, panel: 300 });
    });

    it("never lets two dragged panes swallow the note", () => {
      const fits = layoutPanes({ sidebar: 560, panel: 560 }, room(904));
      assert.ok(fits.sidebar! >= PANE_MIN, `sidebar ${fits.sidebar}`);
      assert.ok(fits.panel! >= PANE_MIN, `panel ${fits.panel}`);
      assert.ok(904 - fits.sidebar! - fits.panel! - 2 >= MAIN_MIN, "the note keeps its floor");
    });

    it("takes the shortfall out of the pane that is NOT under the hand first", () => {
      const fits = layoutPanes({ sidebar: 560, panel: 560 }, room(1200), "sidebar");
      assert.equal(fits.sidebar, 560);
      assert.equal(fits.panel, 1200 - 560 - 2 - MAIN_MIN);
    });

    it("gives a collapsed pane's room to the other", () => {
      assert.deepEqual(layoutPanes({ sidebar: 560, panel: 560 }, room(904, true, false)), { sidebar: 560 });
    });

    it("says nothing about a pane it has no reason to constrain", () => {
      // Nothing stored and room to spare: the stylesheet's own clamp must win
      // (`--sidebar-w: clamp(224px, calc(100vw - 776px), 292px)` is the rule
      // that hands the 1000–1068 band its surplus to the reading column).
      assert.deepEqual(paneStyle({}, room(1440)), { sidebar: null, panel: null });
      // Nothing stored, but no room: the property has something to say.
      assert.ok(paneStyle({}, room(820)).panel! < 300);
      // Stored: always said, so a reload opens at the width that was dragged.
      assert.equal(paneStyle({ sidebar: 380 }, room(1440)).sidebar, 380);
    });
  });

  // A WIDTH THE READER DID NOT ASK FOR DOES NOT ANIMATE — AND THE FLAG THAT
  // SAYS SO DOES NOT OUTLIVE IT. `paneStill` only ever went up: a window under
  // NARROW_QUERY auto-collapses the outline panel at boot, so on a 1366 laptop
  // the shell wore `s-app--pane-still` for the life of the page. Measured at
  // 1300: `.s-sidebar`, `.s-panel` and `.s-main` all at transition-duration 0s
  // at boot and still 0s after the reader's own Ctrl/Cmd+Alt+B — and on the
  // phone, where the notes drawer slides on that same `.s-sidebar`, the drawer
  // stopped moving at all (`transition-property: none`, left −330 → 0 in one
  // frame).
  describe("the still flag comes back down", () => {
    const state = readFileSync(new URL("../client/state.ts", import.meta.url), "utf8");

    it("is raised only by the viewport's own collapse", () => {
      assert.match(state, /collapsePanelForViewport: \(panelCollapsed\) => set\(\{ panelCollapsed, paneStill: true \}\)/);
    });

    // Every setter that moves a pane the reader is touching. Each lowers the
    // flag in the SAME `set` that starts its own animation, so the class is
    // gone in the commit the transition needs — no timer, no effect, nothing
    // that could land a frame late.
    // (setSidebarOpen, the phone drawer's, went with the drawer in 3.27.0.)
    for (const setter of ["setPanelCollapsed", "setSidebarCollapsed", "setZen"]) {
      it(`${setter} lowers it in the same commit`, () => {
        const at = state.indexOf(`${setter}: (`);
        assert.ok(at > 0, `${setter} should exist`);
        const body = state.slice(at, state.indexOf("\n    },", at) + 1);
        assert.ok(body.includes("paneStill: false"), `${setter} must hand the 0.18s back to the reader`);
      });
    }
  });

  // A width the WINDOW asked for arrives at once. Before this the resize
  // listener wrote the clamped widths through the panes' own 0.18s: at
  // 1440 → 904 with {560, 560} stored, `.s-main` measured 0px at 30ms and
  // 274px at 110ms before reaching its 320px floor — the note losing its
  // column on every resize, which is the one thing MAIN_MIN is for.
  it("re-clamps a resized window without the 0.18s", () => {
    const grip = readFileSync(new URL("../client/components/PaneGrip.tsx", import.meta.url), "utf8");
    const at = grip.indexOf("const apply = (): void =>");
    assert.ok(at > 0, "usePaneLayout should still have its rAF-throttled apply");
    assert.match(grip.slice(at, at + 600), /applyPaneWidthsNow\(document\.documentElement, paneRoom\(\)\)/);
    // The double-click reset is the hand, and keeps the animation.
    assert.match(grip, /applyPaneWidths\(document\.documentElement, paneRoom\(\)\)/);
  });

  it("reads stored widths and forgets junk", () => {
    assert.deepEqual(parsePaneWidths('{"sidebar":260,"panel":"x","other":1}'), { sidebar: 260 });
    assert.deepEqual(parsePaneWidths("not json"), {});
    assert.deepEqual(parsePaneWidths(null), {});
  });
});

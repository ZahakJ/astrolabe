import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The drawer breakpoint lives in two places that cannot import each other:
// client/state.ts (matchMedia) and client/styles/app.css (@media). They
// drifted once in spirit — the stylesheet said "phone or no fine pointer",
// the store said "under 1000px" — and the shell would have opened the
// drawer for a sidebar the grid still held. One string, six blocks.
describe("the drawer breakpoint", () => {
  const state = readFileSync(new URL("../client/state.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../client/styles/app.css", import.meta.url), "utf8");
  const m = /export const DRAWER_QUERY = "([^"]+)";/.exec(state);
  it("is one string, mirrored by every drawer block in the stylesheet", () => {
    assert.ok(m, "DRAWER_QUERY not found");
    const q = m![1];
    // THE PRIMARY POINTER, NOT `any-pointer` (3.23.0). `any-pointer: fine` is
    // true on every phone that has ever met a stylus or a bluetooth mouse, and
    // it handed a 720px Galaxy the docked desktop shell. The pair below asks
    // what the device's own input IS: a finger, and one that cannot hover — so
    // a touch laptop (coarse primary, `hover: hover` from the mouse beside it)
    // still keeps its docked, resizable panes, which is what defect F bought.
    assert.ok(
      q.includes("(pointer: coarse) and (hover: none)"),
      "the drawer band must be decided by the PRIMARY pointer",
    );
    assert.ok(
      !q.includes("any-pointer"),
      "a stylus is an any-pointer: fine, and a stylus is not a mouse",
    );
    assert.equal(css.split(`@media ${q} {`).length - 1, 6, "app.css should carry the drawer query in exactly six blocks");
    assert.equal(css.split("@media (max-width: 999px) {").length - 1, 0, "no bare 999px block may remain");
  });
});
